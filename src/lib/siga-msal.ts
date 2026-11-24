// Token do SIGA-PAP. O login do Atlas (Microsoft gerenciado pelo Lovable) não emite token com o escopo
// do plugin, então o MSAL.js faz um login técnico, só no navegador, com o app registration do Atlas.
// O token vai direto para o iframe e nunca é enviado ao servidor do Atlas nem registrado em log.
import type { AccountInfo, AuthenticationResult, PublicClientApplication } from '@azure/msal-browser';
import type { SigaPapConfig } from './siga-config';

export class SigaInteractionRequired extends Error {
  constructor() { super('É preciso entrar com a conta Microsoft para abrir o SIGA.'); this.name = 'SigaInteractionRequired'; }
}

export type SigaToken = { accessToken: string; tenantId: string; userId: string; username: string };

export type SigaTokenProvider = {
  /** Sem `interactive`, nunca abre janela: falha com SigaInteractionRequired se for preciso entrar. */
  getToken(options?: { interactive?: boolean; loginHint?: string | undefined }): Promise<SigaToken>;
};

export function createSigaTokenProvider(config: SigaPapConfig): SigaTokenProvider {
  let appPromise: Promise<PublicClientApplication> | null = null;
  const getApp = () => {
    appPromise ??= import('@azure/msal-browser').then(async ({ PublicClientApplication: Client }) => {
      const app = new Client({
        auth: {
          clientId: config.clientId,
          authority: `https://login.microsoftonline.com/${config.tenantId}`,
          redirectUri: `${window.location.origin}${config.redirectPath}`,
        },
        // sessionStorage: a sessão técnica morre com a aba e não vaza para outra pessoa no mesmo navegador.
        cache: { cacheLocation: 'sessionStorage' },
      });
      await app.initialize();
      return app;
    });
    return appPromise;
  };

  function toToken(app: PublicClientApplication, result: AuthenticationResult): SigaToken {
    const userId = (result.idTokenClaims as { oid?: string } | undefined)?.oid;
    const tenantId = result.tenantId || result.account.tenantId;
    if (!result.accessToken || !userId || tenantId.toLowerCase() !== config.tenantId.toLowerCase() || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(userId)) throw new Error('A resposta da Microsoft veio sem os dados necessários.');
    app.setActiveAccount(result.account);
    return { accessToken: result.accessToken, tenantId, userId, username: result.account.username };
  }

  return {
    async getToken(options = {}) {
      const app = await getApp();
      const scopes = [config.scope];
      const hint = options.loginHint?.toLowerCase();
      const account: AccountInfo | null = app.getActiveAccount()
        ?? app.getAllAccounts().find(candidate => candidate.username.toLowerCase() === hint)
        ?? null;
      if (account) {
        try { return toToken(app, await app.acquireTokenSilent({ scopes, account })); } catch { /* renovação silenciosa falhou: tenta entrar de novo */ }
      }
      if (options.loginHint) {
        try { return toToken(app, await app.ssoSilent({ scopes, loginHint: options.loginHint })); } catch { /* sem sessão no Entra para este navegador */ }
      }
      if (!options.interactive) throw new SigaInteractionRequired();
      return toToken(app, await app.acquireTokenPopup({ scopes, ...(options.loginHint ? { loginHint: options.loginHint } : {}), ...(account ? { account } : {}) }));
    },
  };
}

/** Apaga a sessão técnica do MSAL (todas as chaves `msal.*` da aba). Chamado ao sair do Atlas. */
export function clearSigaSession(): void {
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith('msal.')) window.sessionStorage.removeItem(key);
    }
  } catch { /* armazenamento indisponível: nada a limpar */ }
}
