// Configuração do SIGA-PAP embutido (menu "Administração"). Todos os valores são identificadores
// públicos, não segredos. Ficam em Secrets do servidor (sem prefixo VITE_): o servidor lê, valida e
// entrega ao navegador só estes campos, por server function (siga-pap-config.functions.ts).
// Sem a configuração completa a integração fica desligada: o item de menu some e a página explica o que falta.
export type SigaPapConfig = {
  /** Endereço do plugin (src do iframe). */
  pluginUrl: string;
  /** Origem exata do plugin: único destino do postMessage e única origem aceita de volta. */
  pluginOrigin: string;
  /** Escopo do token feito só para o BFF do plugin. */
  scope: string;
  /** Client ID do app registration do Atlas no Entra ID (o mesmo SIGA_API_CLIENT_ID). */
  clientId: string;
  tenantId: string;
  /** Rota pública do Atlas que recebe a resposta do login (precisa estar nas Redirect URIs SPA do app registration). */
  redirectPath: string;
  /** Só para teste local: dica de login usada quando o e-mail da sessão é fictício. Em produção fica vazio. */
  loginHint: string | null;
};

type Env = Record<string, string | undefined>;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEFAULT_REDIRECT_PATH = '/msal-redirect';

/**
 * Endereços fictícios (example.com, .test, .invalid) nunca existem na Microsoft. Usá-los como dica de
 * login faz o Entra tentar descobrir um domínio federado inexistente e o popup falha (ERR_NAME_NOT_RESOLVED).
 * É o caso das contas de teste do ambiente local.
 */
export function isFictitiousEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return domain === 'example.com' || domain.endsWith('.example.com') || domain.endsWith('.test') || domain.endsWith('.invalid');
}

/** Lê a configuração de um ambiente de servidor (process.env). Nunca chamar no navegador. */
export function readSigaPapConfig(env: Env): SigaPapConfig | null {
  const url = env['SIGA_PAP_URL']?.trim();
  const scope = env['SIGA_PAP_SCOPE']?.trim();
  const clientId = env['SIGA_API_CLIENT_ID']?.trim();
  const tenantId = env['SIGA_TENANT_ID']?.trim();
  const redirectPath = env['SIGA_PAP_REDIRECT_PATH']?.trim() || DEFAULT_REDIRECT_PATH;
  if (!url || !scope || !clientId || !tenantId) return null;
  if (!GUID.test(clientId) || !GUID.test(tenantId) || (!redirectPath.startsWith('/') || redirectPath.startsWith('//') || /[\\?#%]/.test(redirectPath))) return null;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  // O plugin só é servido por HTTPS; http só vale para um plugin local de teste.
  if (parsed.username || parsed.password) return null;
  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) return null;
  const hint = env['SIGA_PAP_LOGIN_HINT']?.trim();
  const loginHint = hint && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(hint) ? hint : null;
  return { pluginUrl: parsed.href, pluginOrigin: parsed.origin, scope, clientId, tenantId, redirectPath, loginHint };
}
