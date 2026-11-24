import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessDecision } from '@/lib/siga-access';
import { Button } from '@/components/ui/button';

const m = vi.hoisted(() => ({ read: vi.fn(), pathname: '/contas' }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: () => m.read }));
vi.mock('@/lib/siga-access.functions', () => ({ getMyAccess: m.read }));
vi.mock('@tanstack/react-router', () => ({
  useLocation: ({ select }: { select: (location: { pathname: string }) => string }) => select({ pathname: m.pathname }),
}));

import { AccessGate } from '@/components/atlas/siga-access';
import { useSigaAccess } from '@/components/atlas/use-siga-access';

function Form() {
  const [text, setText] = useState('');
  return <input aria-label="campo" value={text} onChange={event => setText(event.target.value)} />;
}

function Refresh() {
  const access = useSigaAccess();
  return <Button type="button" onClick={() => void access.refetch()}>refazer</Button>;
}

const cases: [string, AccessDecision][] = [
  ['controle desligado', { status: 'off' }],
  ['acesso concedido', { status: 'ok', granted: ['atlas-kam.contas_consultar'] }],
];

describe.each(cases)('renovação do acesso em segundo plano (%s)', (_name, decision) => {
  afterEach(() => { cleanup(); vi.resetAllMocks(); });

  it('mantém a tela e o texto digitado durante e depois da renovação lenta', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    m.read.mockResolvedValueOnce(decision);
    const view = render(<QueryClientProvider client={client}><Refresh /><AccessGate><Form /></AccessGate></QueryClientProvider>);
    try {
      const field = await screen.findByLabelText('campo');
      fireEvent.change(field, { target: { value: 'rascunho da ocorrência' } });
      expect(field).toHaveValue('rascunho da ocorrência');

      // Mantém a resposta pendente para reproduzir uma renovação com rede lenta.
      let finish: ((value: AccessDecision) => void) | undefined;
      m.read.mockImplementationOnce(() => new Promise<AccessDecision>(resolve => { finish = resolve; }));
      fireEvent.click(screen.getByRole('button', { name: 'refazer' }));
      await waitFor(() => expect(m.read).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(client.getQueryState(['siga-access'])?.fetchStatus).toBe('fetching'));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByLabelText('campo')).toBe(field);
      expect(field).toHaveValue('rascunho da ocorrência');
      if (!finish) throw new Error('Expected pending access request');
      const resolve = finish;
      await act(async () => { resolve(decision); });
      await waitFor(() => expect(client.getQueryState(['siga-access'])?.fetchStatus).toBe('idle'));
      expect(screen.getByLabelText('campo')).toBe(field);
      expect(field).toHaveValue('rascunho da ocorrência');
    } finally {
      view.unmount();
      client.clear();
    }
  });
});