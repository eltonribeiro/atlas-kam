import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SigaPapFrame } from '@/components/atlas/siga-pap-frame';
import { isFictitiousEmail, readSigaPapConfig, type SigaPapConfig } from '@/lib/siga-config';
import { clearSigaSession, SigaInteractionRequired, type SigaTokenProvider } from '@/lib/siga-msal';
import { parsePluginMessage, serializeSessionContext } from '@/lib/siga-session';

// Identificadores fictícios: nenhum valor real do Entra ID entra nos testes.
const ENV = {
  SIGA_PAP_URL: 'https://plugin.example.test',
  SIGA_PAP_SCOPE: 'api://22222222-2222-4222-8222-222222222222/acesso',
  SIGA_API_CLIENT_ID: '11111111-1111-4111-8111-111111111111',
  SIGA_TENANT_ID: '33333333-3333-4333-8333-333333333333',
};
const config = readSigaPapConfig(ENV) as SigaPapConfig;
const TOKEN = { accessToken: 'token-do-plugin', tenantId: ENV.SIGA_TENANT_ID, userId: '44444444-4444-4444-8444-444444444444', username: 'pessoa@example.test' };

describe('SIGA-PAP configuration', () => {
  it('reads the public identifiers and derives the exact plugin origin', () => {
    expect(config).toMatchObject({ pluginOrigin: 'https://plugin.example.test', scope: ENV.SIGA_PAP_SCOPE, clientId: ENV.SIGA_API_CLIENT_ID, redirectPath: '/msal-redirect' });
  });
  it('stays disabled when anything is missing or malformed', () => {
    expect(readSigaPapConfig({})).toBeNull();
    expect(readSigaPapConfig({ ...ENV, SIGA_PAP_SCOPE: '' })).toBeNull();
    expect(readSigaPapConfig({ ...ENV, SIGA_API_CLIENT_ID: 'nao-e-guid' })).toBeNull();
    expect(readSigaPapConfig({ ...ENV, SIGA_PAP_URL: 'http://plugin.example.test' })).toBeNull();
    expect(readSigaPapConfig({ ...ENV, SIGA_PAP_REDIRECT_PATH: 'sem-barra' })).toBeNull();
    expect(readSigaPapConfig({ ...ENV, SIGA_PAP_REDIRECT_PATH: '//outro.example.test' })).toBeNull();
    expect(readSigaPapConfig({ ...ENV, SIGA_PAP_REDIRECT_PATH: '/%2foutro.example.test' })).toBeNull();
    expect(readSigaPapConfig({ ...ENV, SIGA_PAP_URL: 'https://login:password@plugin.example.test' })).toBeNull();
  });
});

describe('SIGA-PAP session cleanup', () => {
  it('removes MSAL state on sign-out and preserves unrelated application state', () => {
    sessionStorage.setItem('msal.test-cache', 'fictitious');
    sessionStorage.setItem('atlas-filter', 'open');
    clearSigaSession();
    expect(sessionStorage.getItem('msal.test-cache')).toBeNull();
    expect(sessionStorage.getItem('atlas-filter')).toBe('open');
    sessionStorage.removeItem('atlas-filter');
  });
});

describe('SIGA-PAP login hint', () => {
  it('never uses a fictitious address as the Microsoft login hint', () => {
    expect(isFictitiousEmail('atlas-test-admin@example.com')).toBe(true);
    expect(isFictitiousEmail('pessoa@empresa.test')).toBe(true);
    expect(isFictitiousEmail('pessoa@dominio.invalid')).toBe(true);
    expect(isFictitiousEmail('pessoa@empresa.com.br')).toBe(false);
    expect(isFictitiousEmail('sem-arroba')).toBe(false);
  });
});

describe('SIGA-PAP message contract', () => {
  it('accepts the plugin requests as JSON string or object and ignores everything else', () => {
    expect(parsePluginMessage('{"type":"plugin-ready"}')).toBe('plugin-ready');
    expect(parsePluginMessage({ type: 'token-request' })).toBe('token-request');
    expect(parsePluginMessage('{"type":"outra-coisa"}')).toBeNull();
    expect(parsePluginMessage('não é json')).toBeNull();
    expect(parsePluginMessage(null)).toBeNull();
  });
  it('serializes the session context as a JSON string with nested fields only', () => {
    const text = serializeSessionContext({ tenantId: 't', userId: 'u', locale: 'pt-BR', clientId: 'c', accessToken: 'a' });
    expect(typeof text).toBe('string');
    expect(JSON.parse(text)).toEqual({ type: 'session-context', tenant: { tenantId: 't' }, user: { userId: 'u' }, session: { locale: 'pt-BR' }, client: { clientId: 'c' }, auth: { accessToken: 'a' } });
  });
});

describe('SIGA-PAP frame handshake', () => {
  const getToken = vi.fn<SigaTokenProvider['getToken']>();
  const provider: SigaTokenProvider = { getToken };
  beforeEach(() => { getToken.mockReset(); getToken.mockResolvedValue(TOKEN); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  function mount() {
    render(<SigaPapFrame config={config} email="pessoa@example.test" provider={provider} />);
    const frame = screen.getByTitle('siga-pap') as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow as Window, 'postMessage');
    const send = (data: unknown, init: { origin?: string; source?: Window | null } = {}) => act(() => { window.dispatchEvent(new MessageEvent('message', {
      data,
      origin: init.origin ?? config.pluginOrigin,
      source: init.source === undefined ? frame.contentWindow : init.source,
    })); });
    return { frame, post, send };
  }

  it('embeds the plugin with the required sandbox', () => {
    const { frame } = mount();
    expect(frame).toHaveAttribute('src', config.pluginUrl);
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-forms');
  });

  it('ends the waiting state when the plugin never sends its handshake', () => {
    vi.useFakeTimers();
    mount();
    act(() => { vi.advanceTimersByTime(15000); });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(getToken).not.toHaveBeenCalled();
  });

  it('answers plugin-ready with the session context, only to the plugin origin', async () => {
    const { post, send } = mount();
    send('{"type":"plugin-ready"}');
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [text, target] = post.mock.calls[0] as [string, string];
    expect(target).toBe(config.pluginOrigin);
    expect(JSON.parse(text)).toEqual({ type: 'session-context', tenant: { tenantId: ENV.SIGA_TENANT_ID }, user: { userId: TOKEN.userId }, session: { locale: expect.any(String) }, client: { clientId: ENV.SIGA_API_CLIENT_ID }, auth: { accessToken: TOKEN.accessToken } });
    expect(getToken).toHaveBeenCalledWith({ interactive: false, loginHint: 'pessoa@example.test' });
    await screen.findByText(/Conectado como pessoa@example.test/);
  });

  it('answers every token-request with a fresh token', async () => {
    const { post, send } = mount();
    send({ type: 'plugin-ready' });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    send({ type: 'token-request' });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it('ignores other origins, other windows and unknown messages', async () => {
    const { post, send } = mount();
    send('{"type":"plugin-ready"}', { origin: 'https://outro.example.test' });
    send('{"type":"plugin-ready"}', { source: null });
    send('{"type":"algo-desconhecido"}');
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(getToken).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('asks for an explicit Microsoft sign-in when the silent token is not possible', async () => {
    getToken.mockRejectedValueOnce(new SigaInteractionRequired());
    const { post, send } = mount();
    send('{"type":"plugin-ready"}');
    fireEvent.click(await screen.findByRole('button', { name: 'Conectar ao SIGA' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(getToken).toHaveBeenLastCalledWith({ interactive: true, loginHint: 'pessoa@example.test' });
  });

  it('never sends anything and shows an alert when the token fails', async () => {
    getToken.mockRejectedValueOnce(new Error('falha'));
    const { post, send } = mount();
    send('{"type":"plugin-ready"}');
    await screen.findByRole('alert');
    expect(post).not.toHaveBeenCalled();
  });

  it('never delivers an in-flight token after the frame unmounts', async () => {
    let resolveToken: ((value: typeof TOKEN) => void) | undefined;
    getToken.mockImplementationOnce(() => new Promise(resolve => { resolveToken = resolve; }));
    const { post, send } = mount();
    send({ type: 'plugin-ready' });
    expect(getToken).toHaveBeenCalledTimes(1);
    cleanup();
    if (!resolveToken) throw new Error('Token request was not started');
    resolveToken(TOKEN);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(post).not.toHaveBeenCalled();
  });
});
