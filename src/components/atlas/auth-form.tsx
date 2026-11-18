import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { LockKeyhole, ShieldCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { Button } from '@/components/ui/button';

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
  return <div className="login-page">
    <main className="login-panel">
      <div className="login-content">
        <img className="login-logo" src="/logo-intralog.png" width={1504} height={422} alt="Atlas KAM" />
        <span className="login-access"><LockKeyhole size={14} /> Acesso interno</span>
        <p className="login-eyebrow">GESTÃO DE CONTAS-CHAVE</p>
        <h1 className="login-title">Atlas KAM</h1>
        <p className="login-subtitle">Módulo de ocorrências</p>
        <section className="login-section" aria-labelledby="login-section-title">
          <h2 id="login-section-title">Entrar na sua conta</h2>
          <hr className="login-divider" />
          <p className="login-text">Acesse com sua conta Microsoft.</p>
          <div className="login-notice"><ShieldCheck size={24} aria-hidden="true" /><span>Ambiente restrito à equipe autorizada</span></div>
          {error && <p role="alert" className="form-error login-error">{error}</p>}
          <Button type="button" size="lg" className="login-button" disabled={busy} onClick={signInWithMicrosoft}>
            {busy ? <Loader2 className="animate-spin" /> : <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M1 1h8v8H1zM11 1h8v8h-8zM1 11h8v8H1zM11 11h8v8h-8z" /></svg>}
            Entrar com Microsoft
          </Button>
          <p className="login-invite">Ainda não tem acesso? Entre em contato com o administrador.</p>
        </section>
      </div>
      <footer className="login-footer"><span>ATLAS · Key Account Manager</span><span>Gestão de reclamações · ISO 10002</span></footer>
    </main>
    <div className="login-visual" aria-hidden="true" />
  </div>;
}
