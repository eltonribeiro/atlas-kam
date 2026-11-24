import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pathname: '/contas',
  access: { isPending: false, data: undefined as unknown, refetch: () => Promise.resolve() },
}));
vi.mock('@tanstack/react-router', () => ({
  useLocation: ({ select }: { select: (location: { pathname: string }) => string }) => select({ pathname: state.pathname }),
}));
vi.mock('@/components/atlas/use-siga-access', () => ({ useSigaAccess: () => state.access }));

import { AccessGate } from '@/components/atlas/siga-access';

function show(pathname: string, access: { isPending?: boolean; data?: unknown }) {
  state.pathname = pathname;
  state.access = { isPending: access.isPending ?? false, data: access.data, refetch: () => Promise.resolve() };
  render(<AccessGate><p>conteúdo da tela</p></AccessGate>);
}

describe('AccessGate', () => {
  afterEach(cleanup);

  it('libera a tela quando o SIGA concede a permissão dela', () => {
    show('/contas', { data: { status: 'ok', granted: ['atlas-kam.contas_consultar'] } });
    expect(screen.getByText('conteúdo da tela')).toBeInTheDocument();
  });
  it('bloqueia a tela cuja permissão foi retirada, sem oferecer nova tentativa', () => {
    show('/relatorios', { data: { status: 'ok', granted: ['atlas-kam.contas_consultar'] } });
    expect(screen.queryByText('conteúdo da tela')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Você não tem permissão para abrir esta tela');
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
  });
  it('com o SIGA fora do ar nada abre e há nova tentativa', () => {
    show('/contas', { data: { status: 'denied', reason: 'unavailable' } });
    expect(screen.queryByText('conteúdo da tela')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
  it('sem oid explica que falta entrar pelo login Microsoft', () => {
    show('/contas', { data: { status: 'denied', reason: 'no-oid' } });
    expect(screen.getByRole('alert')).toHaveTextContent('login Microsoft');
  });
  it('fecha enquanto carrega e quando a própria consulta falha', () => {
    show('/contas', { isPending: true });
    expect(screen.queryByText('conteúdo da tela')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Verificando');
    cleanup();
    show('/contas', { data: undefined });
    expect(screen.queryByText('conteúdo da tela')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
  it('com o controle desligado libera tudo', () => {
    show('/relatorios', { data: { status: 'off' } });
    expect(screen.getByText('conteúdo da tela')).toBeInTheDocument();
  });
  it('a Administração abre mesmo com o SIGA fora, para o administrador corrigir as atribuições', () => {
    show('/administracao', { data: { status: 'denied', reason: 'unavailable' } });
    expect(screen.getByText('conteúdo da tela')).toBeInTheDocument();
  });
  it('mantém a exceção da Administração inclusive durante a primeira consulta', () => {
    show('/administracao', { isPending: true });
    expect(screen.getByText('conteúdo da tela')).toBeInTheDocument();
  });
});
