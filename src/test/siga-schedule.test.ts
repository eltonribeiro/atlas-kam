// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ auth: vi.fn(), tick: vi.fn(), emails: vi.fn(), sync: vi.fn(), config: vi.fn(), from: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (options: unknown) => ({ options }) }));
vi.mock('@/integrations/supabase/cron-auth', () => ({ authenticateCronRequest: m.auth }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { rpc: m.tick, from: m.from } }));
vi.mock('@/lib/notifications.server', () => ({ processDispatches: m.emails }));
vi.mock('@/lib/siga-sync.server', () => ({ runScheduledSigaSync: m.sync }));
import { Route } from '@/routes/api/public/jobs/atlas-tick';

const invoke = () => {
  const options = Route.options as unknown as { server: { handlers: { POST: (arg: { request: Request }) => Promise<Response> } } };
  return options.server.handlers.POST({ request: new Request('https://atlas.example.test/api/public/jobs/atlas-tick', { method: 'POST' }) });
};
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue(null);
  m.tick.mockResolvedValue({ error: null });
  m.emails.mockResolvedValue({ sent: 0 });
  m.sync.mockResolvedValue({ status: 'off' });
});

describe('gancho SIGA na rotina autenticada existente', () => {
  it('rejeita chamada não autenticada antes de executar qualquer trabalho', async () => {
    m.auth.mockResolvedValue(new Response(null, { status: 401 }));
    expect((await invoke()).status).toBe(401);
    expect(m.tick).not.toHaveBeenCalled();
    expect(m.sync).not.toHaveBeenCalled();
  });
  it('observa somente depois do SLA e dos e-mails e projeta só contagens', async () => {
    m.sync.mockResolvedValue({ status: 'done', mode: 'observe', evaluated: 2, divergent: [{ userId: 'internal-test' }], noOid: 1, errors: 0, writesDisabled: false });
    const result = await (await invoke()).json();
    expect(result).toEqual({ ok: true, emails: { sent: 0 }, siga: { status: 'done', mode: 'observe', evaluated: 2, divergent: 1, noOid: 1, errors: 0, writesDisabled: false } });
    expect(m.sync.mock.invocationCallOrder[0]).toBeGreaterThan(m.emails.mock.invocationCallOrder[0] ?? Infinity);
    expect(m.emails.mock.invocationCallOrder[0]).toBeGreaterThan(m.tick.mock.invocationCallOrder[0] ?? Infinity);
  });
  it('falha SIGA não derruba a rotina nem vaza detalhes no log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.sync.mockRejectedValue(new Error('private-response-test'));
    const response = await invoke();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, emails: { sent: 0 }, siga: { status: 'error' } });
    expect(log).toHaveBeenCalledWith('[SIGA] sincronização falhou:', 'unknown');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-response-test');
    log.mockRestore();
  });
});