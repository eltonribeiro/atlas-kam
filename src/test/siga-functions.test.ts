// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  rpc: vi.fn(), profile: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(),
  config: vi.fn(), permissions: vi.fn(), mode: vi.fn(), resolve: vi.fn(), client: vi.fn(),
}));
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ middleware: () => ({
    handler: (handler: (input: { context: { userId: string; supabase: { rpc: typeof m.rpc } } }) => unknown) =>
      () => handler({ context: { userId: 'internal-test-user', supabase: { rpc: m.rpc } } }),
  }) }),
}));
vi.mock('@/integrations/supabase/auth-middleware', () => ({ requireSupabaseAuth: {} }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: m.from } }));
vi.mock('@/lib/siga-api.server', () => ({
  readSigaApiConfig: m.config,
  createSigaApiClient: () => ({ getPermissions: m.permissions }),
  SigaApiError: class extends Error { code = 'http'; },
}));
vi.mock('@/lib/siga-access.server', () => ({
  readAccessMode: m.mode, resolveAccess: m.resolve, getAccessClient: m.client, accessCache: {},
}));

import { checkMySigaPermissions } from '@/lib/siga-sync.functions';
import { getMyAccess } from '@/lib/siga-access.functions';

beforeEach(() => {
  vi.resetAllMocks();
  m.from.mockReturnValue({ select: m.select });
  m.select.mockReturnValue({ eq: m.eq });
  m.eq.mockReturnValue({ maybeSingle: m.profile });
  m.rpc.mockResolvedValue({ data: 'admin', error: null });
  m.config.mockReturnValue({ mode: 'observe' });
  m.profile.mockResolvedValue({ data: { oid: '55555555-5555-4555-8555-555555555555' }, error: null });
  m.permissions.mockResolvedValue({ permissions: [], resolvedAt: null });
});

describe('diagnóstico de administrador no servidor', () => {
  it.each(['kam', 'ops_manager', 'analyst', null])('nega papel %s antes de ler oid ou credenciais', async role => {
    m.rpc.mockResolvedValue({ data: role, error: null });
    await expect(checkMySigaPermissions()).rejects.toThrow('Somente o administrador');
    expect(m.config).not.toHaveBeenCalled();
    expect(m.from).not.toHaveBeenCalled();
  });
  it('nega se a consulta do papel falhar', async () => {
    m.rpc.mockResolvedValue({ data: 'admin', error: { message: 'failed' } });
    await expect(checkMySigaPermissions()).rejects.toThrow('Somente o administrador');
    expect(m.from).not.toHaveBeenCalled();
  });
  it('desligado não lê perfis nem consulta a API', async () => {
    m.config.mockReturnValue({ mode: 'off' });
    expect(await checkMySigaPermissions()).toEqual({ status: 'off' });
    expect(m.from).not.toHaveBeenCalled();
    expect(m.permissions).not.toHaveBeenCalled();
  });
  it('usa somente o oid do próprio perfil identificado no servidor', async () => {
    const result = await checkMySigaPermissions();
    expect(m.from).toHaveBeenCalledWith('profiles');
    expect(m.select).toHaveBeenCalledWith('oid');
    expect(m.eq).toHaveBeenCalledWith('id', 'internal-test-user');
    expect(m.permissions).toHaveBeenCalledWith('55555555-5555-4555-8555-555555555555');
    expect(JSON.stringify(result)).not.toContain('55555555-5555-4555-8555-555555555555');
  });
  it('sem oid não consulta permissões', async () => {
    m.profile.mockResolvedValue({ data: { oid: null }, error: null });
    expect(await checkMySigaPermissions()).toEqual({ status: 'no-oid' });
    expect(m.permissions).not.toHaveBeenCalled();
  });
});

describe('consulta de acesso próprio no servidor', () => {
  it('desligado não acessa o banco nem o SIGA', async () => {
    m.mode.mockReturnValue('off');
    expect(await getMyAccess()).toEqual({ status: 'off' });
    expect(m.from).not.toHaveBeenCalled();
    expect(m.client).not.toHaveBeenCalled();
  });
  it('perfil ilegível fecha o acesso', async () => {
    m.mode.mockReturnValue('enforce');
    m.profile.mockResolvedValue({ data: null, error: { message: 'failed' } });
    expect(await getMyAccess()).toEqual({ status: 'denied', reason: 'unavailable' });
    expect(m.resolve).not.toHaveBeenCalled();
  });
  it('consulta com oid do perfil e devolve só a decisão de tela', async () => {
    m.mode.mockReturnValue('enforce');
    m.client.mockReturnValue({});
    m.resolve.mockResolvedValue({ status: 'ok', granted: ['atlas-kam.contas_consultar'] });
    expect(await getMyAccess()).toEqual({ status: 'ok', granted: ['atlas-kam.contas_consultar'] });
    expect(m.eq).toHaveBeenCalledWith('id', 'internal-test-user');
    expect(m.resolve).toHaveBeenCalledWith(expect.objectContaining({ mode: 'enforce', oid: '55555555-5555-4555-8555-555555555555' }));
  });
});