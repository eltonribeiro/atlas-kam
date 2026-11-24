// Sincronização das permissões do SIGA com os papéis do Atlas, chamada pela rotina de 5 minutos.
// Hoje só OBSERVA: compara e registra quem divergiria. O modo `enforce` ainda não grava nada e se
// comporta como `observe` até a gravação em user_roles ser implementada e aprovada.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { createSigaApiClient, readSigaApiConfig, SigaApiError, type SigaPermissions } from './siga-api.server';
import type { AtlasRole } from './siga-profiles';
import { evaluatePermissions } from './siga-roles';

export type StaffRecord = { userId: string; oid: string | null; role: AtlasRole | null };

export type SigaSyncSummary = {
  status: 'done' | 'aborted';
  mode: 'observe' | 'enforce';
  /** Verdadeiro quando o modo pede gravação: ela ainda não existe, então nada foi gravado. */
  writesDisabled: boolean;
  evaluated: number;
  consistent: number;
  /** Usuários com papel no Atlas que ainda não têm oid (nunca entraram pelo login Microsoft). */
  noOid: number;
  errors: number;
  truncated: boolean;
  abortedBy?: 'auth';
  divergent: { userId: string; currentRole: AtlasRole | null; matchedRoles: AtlasRole[]; missing: number }[];
};

const DEFAULT_LIMIT = 200;
const DEFAULT_CONCURRENCY = 5;

export async function runSigaSync(options: {
  mode: 'observe' | 'enforce';
  staff: readonly StaffRecord[];
  client: { getPermissions(oid: string): Promise<SigaPermissions> };
  limit?: number;
  concurrency?: number;
}): Promise<SigaSyncSummary> {
  const limit = Math.max(1, Math.min(DEFAULT_LIMIT, options.limit ?? DEFAULT_LIMIT));
  const concurrency = Math.max(1, Math.min(DEFAULT_CONCURRENCY, options.concurrency ?? DEFAULT_CONCURRENCY));
  const withOid = options.staff.filter((member): member is StaffRecord & { oid: string } => member.oid !== null);
  const targets = withOid.slice(0, limit);
  const summary: SigaSyncSummary = {
    status: 'done',
    mode: options.mode,
    writesDisabled: options.mode === 'enforce',
    evaluated: 0,
    consistent: 0,
    noOid: options.staff.filter(member => member.oid === null && member.role !== null).length,
    errors: 0,
    truncated: withOid.length > limit,
    divergent: [],
  };

  for (let start = 0; start < targets.length && summary.status === 'done'; start += concurrency) {
    const batch = targets.slice(start, start + concurrency);
    const results = await Promise.all(batch.map(async member => {
      try { return { member, permissions: (await options.client.getPermissions(member.oid)).permissions }; }
      catch (error) { return { member, error }; }
    }));
    for (const result of results) {
      if ('error' in result) {
        summary.errors += 1;
        // Falha de credencial vale para todos: para a rodada em vez de repetir a chamada para cada usuário.
        if (result.error instanceof SigaApiError && result.error.code === 'auth') { summary.status = 'aborted'; summary.abortedBy = 'auth'; }
        continue;
      }
      const evaluation = evaluatePermissions(result.permissions, result.member.role);
      summary.evaluated += 1;
      if (evaluation.consistent) { summary.consistent += 1; continue; }
      summary.divergent.push({ userId: result.member.userId, currentRole: result.member.role, matchedRoles: evaluation.matchedRoles, missing: evaluation.missingForCurrentRole.length });
    }
  }
  return summary;
}

/** Perfis ativos com o papel atual (service role: a coluna oid não é legível pelo usuário). */
export async function loadStaff(admin: SupabaseClient<Database>): Promise<StaffRecord[]> {
  const [profiles, roles] = await Promise.all([
    admin.from('profiles').select('id,oid').eq('active', true),
    admin.from('user_roles').select('user_id,role'),
  ]);
  if (profiles.error || roles.error) throw new Error('Não foi possível carregar a equipe para a sincronização.');
  const roleByUser = new Map((roles.data ?? []).map(row => [row.user_id, row.role as AtlasRole]));
  return (profiles.data ?? [])
    .map(profile => ({ userId: profile.id, oid: profile.oid ?? null, role: roleByUser.get(profile.id) ?? null }))
    .filter(member => member.role !== null || member.oid !== null);
}

let sharedClient: { key: string; client: ReturnType<typeof createSigaApiClient> } | null = null;

/** Chamada pela rotina agendada. Nunca lança por causa do SIGA: a rotina de SLA e e-mails não pode parar. */
export async function runScheduledSigaSync(): Promise<{ status: 'not-configured' | 'off' } | SigaSyncSummary | { status: 'error' }> {
  try {
    const config = readSigaApiConfig();
    if (!config) return { status: 'not-configured' };
    if (config.mode === 'off') return { status: 'off' };
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const key = JSON.stringify(config);
    // Mantém o cliente entre execuções da mesma instância para reaproveitar o token enquanto ele vale.
    if (sharedClient?.key !== key) sharedClient = { key, client: createSigaApiClient(config) };
    const summary = await runSigaSync({ mode: config.mode, staff: await loadStaff(supabaseAdmin), client: sharedClient.client });
    // Só contagens e ids internos do Atlas: nada de oid, e-mail, token ou permissões.
    console.info('[SIGA] sincronização', JSON.stringify({ status: summary.status, mode: summary.mode, writesDisabled: summary.writesDisabled, evaluated: summary.evaluated, consistent: summary.consistent, noOid: summary.noOid, errors: summary.errors, truncated: summary.truncated, divergentTotal: summary.divergent.length, divergentUserIds: summary.divergent.slice(0, 20).map(entry => entry.userId) }));
    return summary;
  } catch (error) {
    console.error('[SIGA] sincronização falhou:', error instanceof SigaApiError ? error.code : 'unknown');
    return { status: 'error' };
  }
}
