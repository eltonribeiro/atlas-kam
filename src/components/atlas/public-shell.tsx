import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Brand } from './brand';

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page public-page">
      <header className="auth-header"><Brand portal /><span className="auth-access"><ShieldCheck size={14} /> Link seguro e pessoal</span></header>
      <main className="public-main">{children}</main>
      <footer className="auth-footer"><span>ATLAS · Key Account Manager</span><span>Não encaminhe este link: ele dá acesso à sua ocorrência.</span></footer>
    </div>
  );
}

export function PublicInvalid({ message }: { message?: string | undefined }) {
  return (
    <section className="public-card">
      <h1>Link inválido ou expirado</h1>
      <p>{message && message !== 'Link inválido ou expirado' ? message : 'Este link não está mais disponível. Se ainda precisar de ajuda com esta ocorrência, responda ao último e-mail recebido ou fale com o seu KAM.'}</p>
    </section>
  );
}

export function formatPublicDate(value?: string | null | undefined) {
  return value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'long', timeStyle: 'short' }).format(new Date(value)) : '—';
}
