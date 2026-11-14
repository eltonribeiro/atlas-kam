import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ArrowLeft, ShieldCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Brand } from './brand';
export function AuthForm({ recovery = false }: { recovery?: boolean }) {
  const navigate = useNavigate();
  const [forgot, setForgot] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [validRecovery, setValidRecovery] = useState(false);
  useEffect(() => {
    if (!recovery) return;
    const isRecovery = new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (isRecovery && session)) setValidRecovery(true);
    });
    if (isRecovery) void supabase.auth.getUser().then(({ data }) => setValidRecovery(Boolean(data.user)));
    return () => data.subscription.unsubscribe();
  }, [recovery]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    try {
      if (recovery) {
        if (!validRecovery) { setError('Link de recuperação inválido ou expirado. Solicite um novo link.'); return; }
        if (password !== String(form.get('confirm'))) { setError('As senhas não coincidem.'); return; }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          if (error.code === 'same_password') setError('A nova senha deve ser diferente da senha anterior. Escolha outra senha e tente novamente.');
          else if (error.code === 'weak_password') setError('Esta senha não atende aos requisitos de segurança. Escolha uma senha mais forte e tente novamente.');
          else setError('Não foi possível atualizar a senha. Tente novamente; se o link expirou, solicite um novo.');
          return;
        }
        await supabase.auth.signOut(); setNotice('Senha atualizada. Entre com sua nova senha.');
      } else if (forgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) { setError('Não foi possível enviar o link agora. Tente novamente em alguns instantes.'); return; }
        setNotice('Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError('E-mail ou senha inválidos. Verifique seus dados e tente novamente.'); return; }
        await navigate({ to: '/ocorrencias' });
      }
    } catch { setError('Não foi possível conectar. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <div className="auth-page"><header className="auth-header"><Brand /><span className="auth-access"><LockKeyhole size={14} /> Acesso interno</span></header><main className="auth-main"><div className="auth-intro"><p className="eyebrow">GESTÃO DE CONTAS-CHAVE</p><h1>Atlas KAM</h1><p>Módulo de ocorrências</p></div><section className="auth-panel"><span className="auth-icon"><LockKeyhole size={22} strokeWidth={1.5} /></span><h2>{recovery ? 'Definir nova senha' : forgot ? 'Recuperar acesso' : 'Entrar na sua conta'}</h2><p className="auth-subtitle">{recovery ? 'Escolha uma nova senha para sua conta.' : forgot ? 'Receba um link no seu e-mail corporativo.' : 'Use seu e-mail e senha de acesso.'}</p><form onSubmit={submit}>{!recovery && <div className="field"><label htmlFor="email">E-mail corporativo</label><Input id="email" name="email" type="email" placeholder="nome@empresa.com.br" autoComplete="email" required disabled={busy} /></div>}{!forgot && <div className="field"><label htmlFor="password">{recovery ? 'Nova senha' : 'Senha'}</label><div className="password-field"><Input id="password" name="password" type={show ? 'text' : 'password'} placeholder={recovery ? 'No mínimo 8 caracteres' : 'Sua senha'} autoComplete={recovery ? 'new-password' : 'current-password'} minLength={recovery ? 8 : undefined} required disabled={busy || (recovery && !validRecovery)} /><Button variant="ghost" size="icon" type="button" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} title={show ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShow(!show)}>{show ? <EyeOff /> : <Eye />}</Button></div></div>}{recovery && <div className="field"><label htmlFor="confirm">Confirmar nova senha</label><Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required disabled={busy || !validRecovery} /></div>}{!forgot && !recovery && <Button type="button" variant="link" className="forgot-button" onClick={() => { setForgot(true); setError(''); }}>Esqueci minha senha</Button>}{error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status" className="form-notice">{notice}</p>}{recovery && !validRecovery && !notice && <p className="form-error">Link de recuperação inválido ou expirado.</p>}<Button className="auth-submit" type="submit" disabled={busy || (recovery && (!validRecovery || Boolean(notice)))}>{busy ? <Loader2 className="animate-spin" /> : null}{recovery ? 'Salvar nova senha' : forgot ? 'Enviar link de recuperação' : 'Entrar'}{!busy && <ArrowRight />}</Button>{forgot && <Button variant="ghost" type="button" className="auth-submit" onClick={() => { setForgot(false); setNotice(''); setError(''); }}><ArrowLeft /> Voltar para entrar</Button>}{recovery && <Button variant="link" asChild className="auth-submit"><Link to="/auth"><ArrowLeft /> Voltar para entrar</Link></Button>}</form><div className="auth-panel-footer"><ShieldCheck size={15} /> Ambiente restrito à equipe autorizada</div></section><p className="auth-invite">Ainda não tem acesso? Entre em contato com o administrador.</p></main><footer className="auth-footer"><span>ATLAS · Key Account Manager</span><span>Gestão de reclamações · ISO 10002</span></footer></div>;
}
