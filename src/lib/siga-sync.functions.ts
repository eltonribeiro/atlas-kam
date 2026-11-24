import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { evaluatePermissions, type PermissionEvaluation } from './siga-roles';
import type { AtlasRole } from './siga-profiles';

export type SigaCheckResult =
  | { status: 'not-configured' | 'off' | 'no-oid' }
  | { status: 'error'; code: string }
  | ({ status: 'ok'; mode: 'observe' | 'enforce'; currentRole: AtlasRole; permissions: string[]; resolvedAt: string | null } & PermissionEvaluation);

/**
 * Diagnóstico: o que o SIGA diz sobre o PRÓPRIO administrador logado, comparado ao papel dele no Atlas.
 * Não grava nada. O oid vem de `profiles.oid` (preenchido só pelo login, nunca pelo navegador) e a chave
 * da API e o client_secret nunca saem do servidor.
 */
export const checkMySigaPermissions = createServerFn()
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SigaCheckResult> => {
    const role = await context.supabase.rpc('current_app_role');
    if (role.error || role.data !== 'admin') throw new Error('Somente o administrador pode consultar o SIGA.');
    const { createSigaApiClient, readSigaApiConfig, SigaApiError } = await import('./siga-api.server');
    const config = readSigaApiConfig();
    if (!config) return { status: 'not-configured' };
    if (config.mode === 'off') return { status: 'off' };
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const profile = await supabaseAdmin.from('profiles').select('oid').eq('id', context.userId).maybeSingle();
    if (profile.error) throw new Error('Não foi possível ler o seu cadastro.');
    if (!profile.data?.oid) return { status: 'no-oid' };
    try {
      const result = await createSigaApiClient(config).getPermissions(profile.data.oid);
      return {
        status: 'ok',
        mode: config.mode,
        currentRole: role.data,
        permissions: result.permissions,
        resolvedAt: result.resolvedAt,
        ...evaluatePermissions(result.permissions, role.data),
      };
    } catch (error) {
      // Só o código do erro: sem corpo da resposta, token ou segredo.
      const code = error instanceof SigaApiError ? error.code + (error.status ? `-${error.status}` : '') : 'unknown';
      console.error('[SIGA] consulta de permissões falhou:', code);
      return { status: 'error', code };
    }
  });
