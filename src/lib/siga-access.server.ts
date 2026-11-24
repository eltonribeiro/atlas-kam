// Decisão de acesso por tela no servidor (fase 3a). Fecha tudo quando o SIGA não responde.
import { createSigaApiClient, readSigaApiConfig, SigaApiError, type SigaPermissions } from './siga-api.server';
import { grantedScreenPermissions, type AccessDecision } from './siga-access';

export type AccessMode = 'off' | 'enforce';

/** `SIGA_ACCESS_MODE`: só `enforce` liga o controle. Ausente ou desconhecido vale `off`. */
export function readAccessMode(env: Record<string, string | undefined>): AccessMode {
  return env['SIGA_ACCESS_MODE']?.trim().toLowerCase() === 'enforce' ? 'enforce' : 'off';
}

/** Quanto tempo uma resposta do SIGA vale. É também o atraso máximo para uma retirada de permissão aparecer. */
export const ACCESS_CACHE_TTL_MS = 60_000;
const ACCESS_CACHE_MAX_ENTRIES = 500;

export type AccessCache = {
  get(oid: string): string[] | undefined;
  set(oid: string, granted: string[]): void;
};

/** Cache em memória por oid. Só guarda sucesso: uma falha nunca fica "lembrada". */
export function createAccessCache(now: () => number = Date.now, ttlMs: number = ACCESS_CACHE_TTL_MS): AccessCache {
  const entries = new Map<string, { at: number; granted: string[] }>();
  return {
    get(oid) {
      const entry = entries.get(oid);
      if (!entry) return undefined;
      if (now() - entry.at >= ttlMs) { entries.delete(oid); return undefined; }
      return entry.granted;
    },
    set(oid, granted) {
      if (entries.size >= ACCESS_CACHE_MAX_ENTRIES) {
        for (const [key, entry] of entries) if (now() - entry.at >= ttlMs) entries.delete(key);
        if (entries.size >= ACCESS_CACHE_MAX_ENTRIES) entries.clear();
      }
      entries.set(oid, { at: now(), granted });
    },
  };
}

export async function resolveAccess(options: {
  mode: AccessMode;
  /** `profiles.oid` da pessoa logada, lido no servidor. Nunca algo que o navegador envie. */
  oid: string | null;
  client: { getPermissions(oid: string): Promise<SigaPermissions> } | null;
  cache?: AccessCache;
}): Promise<AccessDecision> {
  if (options.mode === 'off') return { status: 'off' };
  if (!options.oid) return { status: 'denied', reason: 'no-oid' };
  if (!options.client) return { status: 'denied', reason: 'unavailable' };
  const cached = options.cache?.get(options.oid);
  if (cached) return { status: 'ok', granted: cached };
  try {
    const result = await options.client.getPermissions(options.oid);
    const granted = grantedScreenPermissions(result.permissions);
    options.cache?.set(options.oid, granted);
    return { status: 'ok', granted };
  } catch (error) {
    // Credencial, rede, resposta inesperada ou SIGA fora: nada é liberado. Só o código do erro vai ao log.
    console.error('[SIGA] consulta de acesso falhou:', error instanceof SigaApiError ? error.code : 'unknown');
    return { status: 'denied', reason: 'unavailable' };
  }
}

let sharedClient: { key: string; client: ReturnType<typeof createSigaApiClient> } | null = null;

/** Cliente do SIGA reaproveitado entre requisições (mantém o token enquanto ele vale). `null` se faltar configuração. */
export function getAccessClient(): ReturnType<typeof createSigaApiClient> | null {
  const config = readSigaApiConfig();
  if (!config) return null;
  const key = JSON.stringify(config);
  if (sharedClient?.key !== key) {
    sharedClient = { key, client: createSigaApiClient(config) };
    accessCache = createAccessCache();
  }
  return sharedClient.client;
}

export let accessCache = createAccessCache();
