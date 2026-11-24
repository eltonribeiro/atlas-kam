import type { ReactNode } from 'react';
import { useLocation } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { canOpen, isExemptPath, type AccessDecision } from '@/lib/siga-access';
import { useSigaAccess } from './use-siga-access';

function message(decision: AccessDecision | undefined): string {
  if (decision?.status === 'ok') return 'Você não tem permissão para abrir esta tela. Peça o acesso a quem administra o SIGA.';
  if (decision?.status === 'denied' && decision.reason === 'no-oid') return 'Seu usuário ainda não está vinculado ao SIGA. Saia e entre de novo pelo login Microsoft.';
  return 'Não foi possível confirmar suas permissões no SIGA. Nenhuma tela é liberada até a consulta funcionar.';
}

/** Envolve as telas internas: só mostra a rota atual se o SIGA liberar. Fecha em qualquer dúvida. */
export function AccessGate({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: location => location.pathname });
  const access = useSigaAccess();
  if (isExemptPath(pathname)) return <>{children}</>;
  if (access.isPending) return <main className="atlas-main"><div className="data-message" role="status"><p>Verificando o seu acesso…</p></div></main>;
  if (canOpen(access.data, pathname)) return <>{children}</>;
  const retryable = access.data?.status !== 'ok';
  return <main className="atlas-main"><div className="data-message" role="alert">
    <h2>Acesso não liberado</h2>
    <p>{message(access.data)}</p>
    {retryable && <Button type="button" size="sm" onClick={() => void access.refetch()}>Tentar novamente</Button>}
  </div></main>;
}
