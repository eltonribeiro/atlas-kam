// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSigaApiClient, readSigaApiConfig, SigaApiError, type SigaApiConfig } from '@/lib/siga-api.server';
import { SIGA_PROFILES } from '@/lib/siga-profiles';
import { evaluatePermissions } from '@/lib/siga-roles';
import { runSigaSync } from '@/lib/siga-sync.server';

// Valores fictícios: nenhum segredo, chave ou oid real entra nos testes.
const ENV = {
  SIGA_API_URL: 'https://siga.example.test/qa/v1/',
  SIGA_API_SUBSCRIPTION_KEY: 'chave-fake',
  SIGA_API_CLIENT_ID: '11111111-1111-4111-8111-111111111111',
  SIGA_API_CLIENT_SECRET: 'segredo-fake',
  SIGA_SYNC_MODE: 'observe',
};
const OID = '44444444-4444-4444-8444-444444444444';
const config = readSigaApiConfig(ENV) as SigaApiConfig;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('SIGA API configuration', () => {
  it('reads the secrets and strips the trailing slash', () => {
    expect(config).toMatchObject({ baseUrl: 'https://siga.example.test/qa/v1', mode: 'observe', clientId: ENV.SIGA_API_CLIENT_ID });
  });
  it('stays disabled when a secret is missing or the URL is not https', () => {
    expect(readSigaApiConfig({ ...ENV, SIGA_API_CLIENT_SECRET: '' })).toBeNull();
    expect(readSigaApiConfig({ ...ENV, SIGA_API_URL: 'http://siga.example.test/v1' })).toBeNull();
    expect(readSigaApiConfig({ ...ENV, SIGA_API_URL: 'não é url' })).toBeNull();
    expect(readSigaApiConfig({})).toBeNull();
  });
  it('treats an unknown or missing sync mode as off, never as enforce', () => {
    expect(readSigaApiConfig({ ...ENV, SIGA_SYNC_MODE: 'ligado' })?.mode).toBe('off');
    expect(readSigaApiConfig({ ...ENV, SIGA_SYNC_MODE: undefined })?.mode).toBe('off');
    expect(readSigaApiConfig({ ...ENV, SIGA_SYNC_MODE: ' Enforce ' })?.mode).toBe('enforce');
  });
});

describe('SIGA API client', () => {
  function fakeApi(permissions: string[] = ['atlas-kam.contas_consultar']) {
    return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith('/OAuth')) return json({ access_token: 'token-fake', expires_in: 3600 });
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer token-fake');
      return json({ usuarioOid: OID, permissoes: permissions, resolvidoEm: '2026-01-01T00:00:00Z' });
    });
  }

  it('gets a token with the client credentials, then the permissions of the oid', async () => {
    const fetchFake = fakeApi();
    const result = await createSigaApiClient(config, fetchFake as unknown as typeof fetch).getPermissions(OID);
    expect(result).toEqual({ oid: OID, permissions: ['atlas-kam.contas_consultar'], resolvedAt: '2026-01-01T00:00:00Z' });
    const [oauthUrl, oauthInit] = fetchFake.mock.calls[0] as [string, RequestInit];
    expect(oauthUrl).toBe('https://siga.example.test/qa/v1/OAuth');
    expect(JSON.parse(oauthInit.body as string)).toEqual({ client_id: ENV.SIGA_API_CLIENT_ID, client_secret: ENV.SIGA_API_CLIENT_SECRET });
    expect((oauthInit.headers as Record<string, string>)['Ocp-Apim-Subscription-Key']).toBe('chave-fake');
    expect(String(fetchFake.mock.calls[1]?.[0])).toBe(`https://siga.example.test/qa/v1/acessos/${OID}/permissoes`);
  });

  it('reuses the token until it expires', async () => {
    const fetchFake = fakeApi();
    let clock = 0;
    const client = createSigaApiClient(config, fetchFake as unknown as typeof fetch, () => clock);
    await client.getPermissions(OID);
    await client.getPermissions(OID);
    expect(fetchFake.mock.calls.filter(call => String(call[0]).endsWith('/OAuth'))).toHaveLength(1);
    clock = 3600 * 1000;
    await client.getPermissions(OID);
    expect(fetchFake.mock.calls.filter(call => String(call[0]).endsWith('/OAuth'))).toHaveLength(2);
  });

  it('uses the expires_token date of the real OAuth answer, with a safety margin', async () => {
    const fetchFake = vi.fn(async (url: string | URL | Request) => String(url).endsWith('/OAuth')
      ? json({ created_token: '2026-01-01T10:00:00Z', expires_token: '2026-01-01T11:00:00Z', access_token: 'token-fake' })
      : json({ usuarioOid: OID, permissoes: [] }));
    const oauthCalls = () => fetchFake.mock.calls.filter(call => String(call[0]).endsWith('/OAuth')).length;
    let clock = Date.parse('2026-01-01T10:00:05Z');
    const client = createSigaApiClient(config, fetchFake as unknown as typeof fetch, () => clock);
    await client.getPermissions(OID);
    clock = Date.parse('2026-01-01T10:50:00Z');
    await client.getPermissions(OID);
    expect(oauthCalls()).toBe(1);
    clock = Date.parse('2026-01-01T10:59:30Z');
    await client.getPermissions(OID);
    expect(oauthCalls()).toBe(2);
  });

  it('asks for a new token once when the API answers 401', async () => {
    let first = true;
    const fetchFake = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/OAuth')) return json({ access_token: 'token-fake' });
      if (first) { first = false; return new Response('', { status: 401 }); }
      return json({ usuarioOid: OID, permissoes: [] });
    });
    await expect(createSigaApiClient(config, fetchFake as unknown as typeof fetch).getPermissions(OID)).resolves.toMatchObject({ permissions: [] });
    expect(fetchFake.mock.calls.filter(call => String(call[0]).endsWith('/OAuth'))).toHaveLength(2);
  });
  it('classifica 401 persistente como falha de credencial sem repetir indefinidamente', async () => {
    const fetchFake = vi.fn(async (url: string | URL | Request) => String(url).endsWith('/OAuth')
      ? json({ access_token: 'token-fake' })
      : new Response('', { status: 401 }));
    await expect(createSigaApiClient(config, fetchFake as typeof fetch).getPermissions(OID)).rejects.toMatchObject({ code: 'auth', status: 401 });
    expect(fetchFake.mock.calls.filter(call => String(call[0]).endsWith('/OAuth'))).toHaveLength(2);
  });

  it('rejects an answer that belongs to another user', async () => {
    const fetchFake = vi.fn(async (url: string | URL | Request) => String(url).endsWith('/OAuth')
      ? json({ access_token: 'token-fake' })
      : json({ usuarioOid: '55555555-5555-4555-8555-555555555555', permissoes: ['atlas-kam.contas_editar'] }));
    await expect(createSigaApiClient(config, fetchFake as unknown as typeof fetch).getPermissions(OID)).rejects.toMatchObject({ code: 'mismatch' });
  });

  it('rejects malformed answers and a malformed oid without calling the API', async () => {
    const bad = vi.fn(async (url: string | URL | Request) => String(url).endsWith('/OAuth') ? json({ access_token: 'token-fake' }) : json({ permissoes: 'x' }));
    await expect(createSigaApiClient(config, bad as unknown as typeof fetch).getPermissions(OID)).rejects.toMatchObject({ code: 'shape' });
    const never = vi.fn();
    await expect(createSigaApiClient(config, never as unknown as typeof fetch).getPermissions('../../x')).rejects.toMatchObject({ code: 'shape' });
    expect(never).not.toHaveBeenCalled();
  });

  it('never leaks the secrets, the token or the response body in errors', async () => {
    const fetchFake = vi.fn(async () => new Response('corpo com segredo-fake e chave-fake', { status: 403 }));
    const error = await createSigaApiClient(config, fetchFake as unknown as typeof fetch).getPermissions(OID).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SigaApiError);
    expect(error).toMatchObject({ code: 'auth', status: 403 });
    expect(String((error as Error).message)).not.toMatch(/segredo-fake|chave-fake|token-fake/);
  });
});

describe('SIGA permissions versus Atlas role', () => {
  const profile = (name: string) => SIGA_PROFILES.find(entry => entry.profile === name)?.permissions ?? [];

  it('maps each approved profile to its Atlas role', () => {
    expect(SIGA_PROFILES.map(entry => [entry.profile, entry.role])).toEqual([
      ['analista-atlas', 'analyst'], ['kam-atlas', 'kam'], ['gestor-operacoes-atlas', 'ops_manager'], ['administrador-atlas', 'admin'],
    ]);
    for (const entry of SIGA_PROFILES) expect(evaluatePermissions(entry.permissions, entry.role)).toMatchObject({ consistent: true, missingForCurrentRole: [] });
  });
  it('flags a divergence when the SIGA does not grant the current role fully', () => {
    const partial = profile('kam-atlas').slice(1);
    const result = evaluatePermissions(partial, 'kam');
    expect(result.consistent).toBe(false);
    expect(result.missingForCurrentRole).toEqual(profile('kam-atlas').slice(0, 1));
    expect(result.matchedRoles).not.toContain('kam');
  });
  it('reports permissions that are not in the approved manifest', () => {
    const result = evaluatePermissions([...profile('administrador-atlas'), 'administracao_gerir-siga', 'administracao_gerir'], 'admin');
    expect(result.unknownPermissions).toEqual(['administracao_gerir', 'administracao_gerir-siga']);
    expect(result.consistent).toBe(true);
  });
  it('ignores the siga_* permissions that the SIGA-PAP applies by itself', () => {
    const result = evaluatePermissions([...profile('administrador-atlas'), 'siga_perfil_listar', 'siga_plataforma_administrar'], 'admin');
    expect(result.unknownPermissions).toEqual([]);
    expect(result.consistent).toBe(true);
  });
  it('is consistent only when both the SIGA and the Atlas give no access', () => {
    expect(evaluatePermissions([], null).consistent).toBe(true);
    expect(evaluatePermissions([], 'analyst').consistent).toBe(false);
    expect(evaluatePermissions(profile('analista-atlas'), null).consistent).toBe(false);
  });
});

describe('SIGA observe-only synchronization', () => {
  const perms = (name: string) => SIGA_PROFILES.find(entry => entry.profile === name)?.permissions ?? [];
  const oidOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const staff = [
    { userId: 'u-admin', oid: oidOf(1), role: 'admin' as const },
    { userId: 'u-kam', oid: oidOf(2), role: 'kam' as const },
    { userId: 'u-sem-oid', oid: null, role: 'analyst' as const },
    { userId: 'u-novo', oid: oidOf(3), role: null },
  ];
  const clientFor = (byOid: Record<string, readonly string[] | Error>) => ({
    getPermissions: vi.fn(async (oid: string) => {
      const entry = byOid[oid];
      if (entry instanceof Error) throw entry;
      return { oid, permissions: [...(entry ?? [])], resolvedAt: null };
    }),
  });

  it('counts consistent users, lists divergences and users without oid, and writes nothing', async () => {
    const client = clientFor({
      [oidOf(1)]: perms('administrador-atlas'),
      [oidOf(2)]: perms('kam-atlas').slice(1),
      [oidOf(3)]: perms('analista-atlas'),
    });
    const summary = await runSigaSync({ mode: 'observe', staff, client });
    expect(summary).toMatchObject({ status: 'done', evaluated: 3, consistent: 1, noOid: 1, errors: 0, truncated: false, writesDisabled: false });
    expect(summary.divergent.map(entry => entry.userId).sort()).toEqual(['u-kam', 'u-novo']);
    expect(summary.divergent.find(entry => entry.userId === 'u-novo')).toMatchObject({ currentRole: null, matchedRoles: ['analyst'] });
  });

  it('behaves as observe in enforce mode and says that writing is disabled', async () => {
    const summary = await runSigaSync({ mode: 'enforce', staff: staff.slice(0, 1), client: clientFor({ [oidOf(1)]: perms('administrador-atlas') }) });
    expect(summary).toMatchObject({ mode: 'enforce', writesDisabled: true, consistent: 1 });
  });

  it('keeps going when one user fails but stops the whole run on a credential failure', async () => {
    const some = await runSigaSync({ mode: 'observe', staff, client: clientFor({ [oidOf(1)]: new SigaApiError('http', 500), [oidOf(2)]: perms('kam-atlas'), [oidOf(3)]: [] }) });
    expect(some).toMatchObject({ status: 'done', errors: 1, evaluated: 2 });
    const client = clientFor({ [oidOf(1)]: new SigaApiError('auth', 401) });
    const aborted = await runSigaSync({ mode: 'observe', staff, client, concurrency: 1 });
    expect(aborted).toMatchObject({ status: 'aborted', abortedBy: 'auth', errors: 1 });
    expect(client.getPermissions).toHaveBeenCalledTimes(1);
  });

  it('caps the number of calls per run and reports the truncation', async () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ userId: `u${index}`, oid: oidOf(index + 10), role: null }));
    const client = clientFor({});
    const summary = await runSigaSync({ mode: 'observe', staff: many, client, limit: 5 });
    expect(client.getPermissions).toHaveBeenCalledTimes(5);
    expect(summary).toMatchObject({ truncated: true, evaluated: 5 });
  });
  it('limita a rodada a 200 pessoas e no máximo cinco consultas simultâneas', async () => {
    let running = 0;
    let peak = 0;
    const client = { getPermissions: vi.fn(async (oid: string) => {
      running += 1; peak = Math.max(peak, running);
      await Promise.resolve();
      running -= 1;
      return { oid, permissions: [], resolvedAt: null };
    }) };
    const many = Array.from({ length: 201 }, (_, i) => ({ userId: `fictitious-${i}`, oid: oidOf(i), role: null }));
    const summary = await runSigaSync({ mode: 'observe', staff: many, client, limit: 999, concurrency: 999 });
    expect(summary.evaluated).toBe(200);
    expect(summary.truncated).toBe(true);
    expect(peak).toBe(5);
  });
});
