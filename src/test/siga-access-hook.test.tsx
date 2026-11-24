import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: () => m.read }));
vi.mock('@/lib/siga-access.functions', () => ({ getMyAccess: m.read }));
import { useSigaAccess } from '@/components/atlas/use-siga-access';

describe('renovação de acesso no navegador', () => {
  afterEach(() => vi.resetAllMocks());
  it('não reaproveita autorização anterior durante a consulta nem depois de falha', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    m.read.mockResolvedValueOnce({ status: 'ok', granted: ['atlas-kam.contas_consultar'] });
    const hook = renderHook(() => useSigaAccess(), { wrapper });
    await waitFor(() => expect(hook.result.current.data?.status).toBe('ok'));
    let fail: ((reason: Error) => void) | undefined;
    m.read.mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; }));
    let refreshing: Promise<unknown> | undefined;
    act(() => { refreshing = hook.result.current.refetch(); });
    await waitFor(() => expect(hook.result.current.data).toBeUndefined());
    // Desabilita retry para conferir a falha sem consumir tempo ou fazer rede.
    client.setQueryDefaults(['siga-access'], { retry: false });
    if (!fail) throw new Error('Expected pending access request');
    m.read.mockRejectedValue(new Error('offline'));
    const reject = fail;
    await act(async () => { reject(new Error('offline')); await refreshing; });
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.data).toBeUndefined();
    hook.unmount();
    client.clear();
  });
});