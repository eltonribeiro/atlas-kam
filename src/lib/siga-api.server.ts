// Cliente servidor da API de permissões do SIGA (via API Management). Roda só no servidor: a chave de
// assinatura e o client_secret vêm de Secrets e nunca chegam ao navegador, a log ou a mensagens de erro.
import { z } from 'zod';

export type SigaSyncMode = 'off' | 'observe' | 'enforce';

export type SigaApiConfig = {
  baseUrl: string;
  subscriptionKey: string;
  clientId: string;
  clientSecret: string;
  mode: SigaSyncMode;
};

type Env = Record<string, string | undefined>;

export function readSigaApiConfig(env: Env = process.env): SigaApiConfig | null {
  const baseUrl = env['SIGA_API_URL']?.trim().replace(/\/+$/, '');
  const subscriptionKey = env['SIGA_API_SUBSCRIPTION_KEY']?.trim();
  const clientId = env['SIGA_API_CLIENT_ID']?.trim();
  const clientSecret = env['SIGA_API_CLIENT_SECRET']?.trim();
  if (!baseUrl || !subscriptionKey || !clientId || !clientSecret) return null;
  let parsed: URL;
  try { parsed = new URL(baseUrl); } catch { return null; }
  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) return null;
  const raw = env['SIGA_SYNC_MODE']?.trim().toLowerCase();
  // Qualquer valor desconhecido vale como desligado: nunca escrever acesso por engano.
  const mode: SigaSyncMode = raw === 'observe' || raw === 'enforce' ? raw : 'off';
  return { baseUrl, subscriptionKey, clientId, clientSecret, mode };
}

export type SigaApiErrorCode = 'auth' | 'http' | 'shape' | 'mismatch' | 'timeout';

/** Erro sem corpo de resposta, sem token e sem segredo: só o código e o status. */
export class SigaApiError extends Error {
  constructor(readonly code: SigaApiErrorCode, readonly status?: number) {
    super(`Falha ao consultar o SIGA (${code}${status ? ` ${status}` : ''}).`);
    this.name = 'SigaApiError';
  }
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resposta real do OAuth (QA): { created_token, expires_token (ISO UTC), access_token }. Os demais nomes
// ficam aceitos por tolerância, e sem nenhuma data de expiração vale um prazo curto.
const tokenSchema = z.object({
  expires_token: z.string().optional(),
  access_token: z.string().min(1).optional(),
  accessToken: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
  expires_in: z.coerce.number().positive().optional(),
  expiresIn: z.coerce.number().positive().optional(),
});

const permissionsSchema = z.object({
  usuarioOid: z.string().regex(GUID),
  permissoes: z.array(z.string().min(1).max(200)).max(1000),
  resolvidoEm: z.string().optional(),
});

const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_TOKEN_TTL_S = 240;
const EXPIRY_MARGIN_S = 60;

export type SigaPermissions = { oid: string; permissions: string[]; resolvedAt: string | null };

export function createSigaApiClient(config: SigaApiConfig, fetchImpl: typeof fetch = fetch, now: () => number = Date.now) {
  let cached: { token: string; expiresAt: number } | null = null;
  const headers = (extra: Record<string, string> = {}) => ({ 'Ocp-Apim-Subscription-Key': config.subscriptionKey, ...extra });

  async function send(url: string, init: RequestInit) {
    try {
      return await fetchImpl(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      throw new SigaApiError(error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'http');
    }
  }

  async function accessToken(force = false) {
    if (!force && cached && cached.expiresAt > now()) return cached.token;
    const response = await send(`${config.baseUrl}/OAuth`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret }),
    });
    if (!response.ok) throw new SigaApiError('auth', response.status);
    const parsed = tokenSchema.safeParse(await response.json().catch(() => null));
    const token = parsed.success ? parsed.data.access_token ?? parsed.data.accessToken ?? parsed.data.token : undefined;
    if (!parsed.success || !token) throw new SigaApiError('shape');
    const expiresOn = parsed.data.expires_token ? Date.parse(parsed.data.expires_token) : Number.NaN;
    const ttl = Math.max(parsed.data.expires_in ?? parsed.data.expiresIn ?? DEFAULT_TOKEN_TTL_S, EXPIRY_MARGIN_S + 1) - EXPIRY_MARGIN_S;
    cached = { token, expiresAt: Number.isFinite(expiresOn) ? expiresOn - EXPIRY_MARGIN_S * 1000 : now() + ttl * 1000 };
    return token;
  }

  async function getPermissions(oid: string): Promise<SigaPermissions> {
    if (!GUID.test(oid)) throw new SigaApiError('shape');
    const url = `${config.baseUrl}/acessos/${encodeURIComponent(oid)}/permissoes`;
    let response = await send(url, { method: 'GET', headers: headers({ Authorization: `Bearer ${await accessToken()}` }) });
    if (response.status === 401) {
      // Token vencido antes do previsto: pede outro uma única vez.
      response = await send(url, { method: 'GET', headers: headers({ Authorization: `Bearer ${await accessToken(true)}` }) });
    }
    if (!response.ok) throw new SigaApiError(response.status === 401 || response.status === 403 ? 'auth' : 'http', response.status);
    const parsed = permissionsSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new SigaApiError('shape');
    // A resposta tem de ser do usuário pedido; qualquer outra coisa é descartada.
    if (parsed.data.usuarioOid.toLowerCase() !== oid.toLowerCase()) throw new SigaApiError('mismatch');
    return { oid: parsed.data.usuarioOid, permissions: [...new Set(parsed.data.permissoes)], resolvedAt: parsed.data.resolvidoEm ?? null };
  }

  return { getPermissions };
}
