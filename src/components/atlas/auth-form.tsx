import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { LockKeyhole, ShieldCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { Button } from '@/components/ui/button';
import { Brand } from './brand';

export function AuthForm() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void navigate({ to: '/ocorrencias', replace: true });
    });
  }, [navigate]);
  async function signInWithMicrosoft() {
    setBusy(true); setError('');
    try {
      const result = await lovable.auth.signInWithOAuth('microsoft', {
        redirect_uri: `${window.location.origin}/auth`,
      });
      if (result.error) {
        setError('Não foi possível entrar com a Microsoft. Tente novamente.');
        return;
      }
      if (result.redirected) return;
      const { data, error: sessionError } = await supabase.auth.getUser();
      if (sessionError || !data.user) {
        setError('Não foi possível confirmar seu acesso. Tente novamente.');
        return;
      }
      await navigate({ to: '/ocorrencias', replace: true });
    } catch {
      setError('Não foi possível conectar à Microsoft. Tente novamente.');
    } finally { setBusy(false); }
  }
  return <div className="auth-page">
    <header className="auth-header"><Brand /><span className="auth-access"><LockKeyhole size={14} /> Acesso interno</span></header>
    <main className="auth-main">
      <div className="auth-intro"><p className="eyebrow">GESTÃO DE CONTAS-CHAVE</p><h1>Atlas KAM</h1><p>Módulo de ocorrências</p></div>
      <section className="auth-panel">
        <span className="auth-icon"><LockKeyhole size={22} strokeWidth={1.5} /></span>
        <h2>Entrar na sua conta</h2>
        <p className="auth-subtitle">Acesse com sua conta Microsoft.</p>
        {error && <p role="alert" className="form-error">{error}</p>}
        <Button type="button" className="w-full mt-4" disabled={busy} onClick={signInWithMicrosoft}>
          {busy ? <Loader2 className="animate-spin" /> : <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M1 1h8v8H1zM11 1h8v8h-8zM1 11h8v8H1zM11 11h8v8h-8z" /></svg>}
          Entrar com Microsoft
        </Button>
        <div className="auth-panel-footer"><ShieldCheck size={15} /> Ambiente restrito à equipe autorizada</div>
      </section>
      <p className="auth-invite">Ainda não tem acesso? Entre em contato com o administrador.</p>
    </main>
    <footer className="auth-footer"><span>ATLAS · Key Account Manager</span><span>Gestão de reclamações · ISO 10002</span></footer>
  </div>;
}
