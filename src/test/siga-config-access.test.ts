import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), read: vi.fn() }));
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ middleware: () => ({ handler: (handler: (input: { context: { supabase: { rpc: typeof mocks.rpc } } }) => unknown) => () => handler({ context: { supabase: { rpc: mocks.rpc } } }) }) }),
}));
vi.mock('@/integrations/supabase/auth-middleware', () => ({ requireSupabaseAuth: {} }));
vi.mock('@/lib/siga-config', () => ({ readSigaPapConfig: mocks.read }));
import { getSigaPapConfig } from '@/lib/siga-pap-config.functions';

describe('SIGA public configuration authorization', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it('reads configuration only after the server confirms an administrator role', async () => {
    mocks.rpc.mockResolvedValue({ data: 'admin', error: null });
    mocks.read.mockReturnValue({ clientId: 'fictitious-public-client' });
    expect(await getSigaPapConfig()).toEqual({ clientId: 'fictitious-public-client' });
    expect(mocks.rpc).toHaveBeenCalledWith('current_app_role');
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it.each(['kam', 'ops_manager', 'analyst', null])('does not expose configuration to role %s', async role => {
    mocks.rpc.mockResolvedValue({ data: role, error: null });
    expect(await getSigaPapConfig()).toBeNull();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('fails closed if the role lookup fails', async () => {
    mocks.rpc.mockResolvedValue({ data: 'admin', error: { message: 'unavailable' } });
    expect(await getSigaPapConfig()).toBeNull();
    expect(mocks.read).not.toHaveBeenCalled();
  });
});