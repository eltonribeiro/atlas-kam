// Contrato do postMessage com o SIGA-PAP (docs do hub: INTEGRACAO_SIGA.md §4).
// O plugin pede a sessão (plugin-ready, token-request) e a aplicação responde com um session-context
// serializado como STRING JSON, com os campos aninhados. Nada além disso é enviado ao plugin.
export type PluginMessageType = 'plugin-ready' | 'token-request';

export type SigaSessionInput = {
  tenantId: string;
  /** oid do usuário no Entra ID, nunca o e-mail. */
  userId: string;
  locale: string;
  clientId: string;
  /** Token do escopo do plugin; só tem valor para o BFF dele. */
  accessToken: string;
};

/** Aceita a mensagem como string JSON (o plugin envia assim) ou como objeto. Qualquer outra coisa é ignorada. */
export function parsePluginMessage(data: unknown): PluginMessageType | null {
  let value = data;
  if (typeof data === 'string') {
    try { value = JSON.parse(data); } catch { return null; }
  }
  if (!value || typeof value !== 'object') return null;
  const type = (value as { type?: unknown }).type;
  return type === 'plugin-ready' || type === 'token-request' ? type : null;
}

export function serializeSessionContext(input: SigaSessionInput): string {
  return JSON.stringify({
    type: 'session-context',
    tenant: { tenantId: input.tenantId },
    user: { userId: input.userId },
    session: { locale: input.locale },
    client: { clientId: input.clientId },
    auth: { accessToken: input.accessToken },
  });
}
