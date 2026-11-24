// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { canOpen, grantedScreenPermissions, isExemptPath, permissionForPath, type AccessDecision } from '@/lib/siga-access';
import { ACCESS_CACHE_TTL_MS, createAccessCache, readAccessMode, resolveAccess } from '@/lib/siga-access.server';
import { SigaApiError } from '@/lib/siga-api.server';

// Dados fictícios: nenhum oid, e-mail ou permissão de pessoa real entra nos testes.
const OID = '55555555-5555-4555-8555-555555555555';
const ALL = [
  'atlas-kam.ocorrencias_consultar', 'atlas-kam.ocorrencias_registrar', 'atlas-kam.problemas_consultar',
  'atlas-kam.contas_consultar', 'atlas-kam.contratos-sla_consultar', 'atlas-kam.relatorios_consultar',
];
const MENU = ['/contas', '/ocorrencias', '/config/sla', '/problemas', '/relatorios', '/administracao'];
const ok = (granted: string[]): AccessDecision => ({ status: 'ok', granted });
const openMenu = (decision: AccessDecision | undefined) => MENU.filter(path => canOpen(decision, path));

describe('mapa de telas', () => {
  it.each([
    ['/contas', 'atlas-kam.contas_consultar'],
    ['/ocorrencias', 'atlas-kam.ocorrencias_consultar'],
    ['/ocorrencias/nova', 'atlas-kam.ocorrencias_registrar'],
    ['/config/sla', 'atlas-kam.contratos-sla_consultar'],
    ['/problemas', 'atlas-kam.problemas_consultar'],
    ['/relatorios', 'atlas-kam.relatorios_consultar'],
  ])('exige a permissão do manifesto para %s', (path, permission) => {
    expect(permissionForPath(path)).toBe(permission);
    expect(canOpen(ok([permission]), path)).toBe(true);
    expect(canOpen(ok([]), path)).toBe(false);
  });
  it('usa a rota mais específica e respeita o limite de segmento', () => {
    expect(permissionForPath('/ocorrencias/nova')).toBe('atlas-kam.ocorrencias_registrar');
    expect(permissionForPath('/ocorrencias')).toBe('atlas-kam.ocorrencias_consultar');
    expect(permissionForPath('/ocorrencias/abc-123')).toBe('atlas-kam.ocorrencias_consultar');
    expect(permissionForPath('/config/sla')).toBe('atlas-kam.contratos-sla_consultar');
    expect(permissionForPath('/contasx')).toBeNull();
    expect(permissionForPath('/qualquer-outra')).toBeNull();
  });
  it('só a Administração é isenta', () => {
    expect(isExemptPath('/administracao')).toBe(true);
    expect(isExemptPath('/administracaox')).toBe(false);
    expect(isExemptPath('/contas')).toBe(false);
  });
  it('guarda só permissões de tela, sem repetição', () => {
    expect(grantedScreenPermissions(['siga_x_ver', 'atlas-kam.contas_consultar', 'atlas-kam.contas_consultar', 'atlas-kam.ocorrencias_exportar']))
      .toEqual(['atlas-kam.contas_consultar']);
  });
});

describe('decisão no navegador', () => {
  it('controle desligado não restringe nada', () => {
    expect(openMenu({ status: 'off' })).toEqual(MENU);
  });
  it('com todas as permissões libera todo o menu', () => {
    expect(openMenu(ok(ALL))).toEqual(MENU);
  });
  it('retirar Contas, Contratos e SLA e Relatórios fecha só essas telas', () => {
    const granted = ALL.filter(permission => !/contas_|contratos-sla_|relatorios_/.test(permission));
    expect(openMenu(ok(granted))).toEqual(['/ocorrencias', '/problemas', '/administracao']);
    expect(canOpen(ok(granted), '/contas')).toBe(false);
    expect(canOpen(ok(granted), '/relatorios')).toBe(false);
  });
  it('quem só consulta ocorrências não abre o formulário de nova', () => {
    const decision = ok(['atlas-kam.ocorrencias_consultar']);
    expect(canOpen(decision, '/ocorrencias')).toBe(true);
    expect(canOpen(decision, '/ocorrencias/nova')).toBe(false);
  });
  it('rota fora do mapa fica fechada', () => {
    expect(canOpen(ok(ALL), '/nova-tela-sem-mapa')).toBe(false);
  });
  it('com o SIGA fora, sem oid, carregando ou com falha, nada abre (exceto a Administração)', () => {
    for (const decision of [{ status: 'denied', reason: 'unavailable' }, { status: 'denied', reason: 'no-oid' }, undefined] as (AccessDecision | undefined)[]) {
      expect(openMenu(decision)).toEqual(['/administracao']);
    }
  });
});

describe('modo de acesso', () => {
  it('só "enforce" liga o controle; o resto vale off', () => {
    expect(readAccessMode({})).toBe('off');
    expect(readAccessMode({ SIGA_ACCESS_MODE: 'off' })).toBe('off');
    expect(readAccessMode({ SIGA_ACCESS_MODE: 'ligado' })).toBe('off');
    expect(readAccessMode({ SIGA_ACCESS_MODE: ' Enforce ' })).toBe('enforce');
  });
});

describe('decisão no servidor', () => {
  const answer = (permissions: string[]) => ({ getPermissions: vi.fn().mockResolvedValue({ oid: OID, permissions, resolvedAt: null }) });

  it('desligado: não consulta o SIGA', async () => {
    const client = answer(ALL);
    expect(await resolveAccess({ mode: 'off', oid: OID, client })).toEqual({ status: 'off' });
    expect(client.getPermissions).not.toHaveBeenCalled();
  });
  it('sem oid ou sem cliente configurado: nega', async () => {
    const client = answer(ALL);
    expect(await resolveAccess({ mode: 'enforce', oid: null, client })).toEqual({ status: 'denied', reason: 'no-oid' });
    expect(await resolveAccess({ mode: 'enforce', oid: OID, client: null })).toEqual({ status: 'denied', reason: 'unavailable' });
    expect(client.getPermissions).not.toHaveBeenCalled();
  });
  it('concede só as permissões de tela que o SIGA devolveu', async () => {
    const client = answer(['atlas-kam.ocorrencias_consultar', 'siga_x_ver', 'atlas-kam.ocorrencias_exportar']);
    expect(await resolveAccess({ mode: 'enforce', oid: OID, client })).toEqual({ status: 'ok', granted: ['atlas-kam.ocorrencias_consultar'] });
  });
  it('SIGA fora do ar (qualquer erro): nega e não guarda a falha', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const getPermissions = vi.fn()
      .mockRejectedValueOnce(new SigaApiError('timeout'))
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValueOnce({ oid: OID, permissions: ALL, resolvedAt: null });
    const cache = createAccessCache();
    const client = { getPermissions };
    expect(await resolveAccess({ mode: 'enforce', oid: OID, client, cache })).toEqual({ status: 'denied', reason: 'unavailable' });
    expect(await resolveAccess({ mode: 'enforce', oid: OID, client, cache })).toEqual({ status: 'denied', reason: 'unavailable' });
    expect((await resolveAccess({ mode: 'enforce', oid: OID, client, cache })).status).toBe('ok');
    // O log traz só o código do erro: nunca o oid.
    expect(JSON.stringify(spy.mock.calls)).not.toContain(OID);
    spy.mockRestore();
  });
  it('reaproveita a resposta por um minuto e depois consulta de novo', async () => {
    let now = 1_000;
    const cache = createAccessCache(() => now);
    const client = answer(ALL);
    await resolveAccess({ mode: 'enforce', oid: OID, client, cache });
    await resolveAccess({ mode: 'enforce', oid: OID, client, cache });
    expect(client.getPermissions).toHaveBeenCalledTimes(1);
    now += ACCESS_CACHE_TTL_MS;
    await resolveAccess({ mode: 'enforce', oid: OID, client, cache });
    expect(client.getPermissions).toHaveBeenCalledTimes(2);
  });
});
