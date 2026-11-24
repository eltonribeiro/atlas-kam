import { useEffect, useState } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { LogOut, Menu, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { getSigaPapConfig } from '@/lib/siga-pap-config.functions';
import { Brand } from './brand';
import { NotificationBell } from './notification-bell';
export function Navigation() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const pathname = useLocation({ select: location => location.pathname });
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? '')); }, []);
  const role = useQuery({ queryKey: ['app-role'], staleTime: 5 * 60_000, queryFn: async () => {
    const { data, error } = await supabase.rpc('current_app_role');
    if (error) return null;
    return data;
  } });
  const sigaPap = useQuery({ queryKey: ['siga-pap-config'], staleTime: 5 * 60_000, enabled: role.data === 'admin', queryFn: () => getSigaPapConfig() });
  const showAdministration = role.data === 'admin' && sigaPap.data != null;
  const items = [{ to: '/contas', name: 'Contas' }, { to: '/ocorrencias', name: 'Ocorrências' }, { to: '/config/sla', name: 'Contratos e SLA' }, { to: '/problemas', name: 'Problemas (RCA)' }, { to: '/relatorios', name: 'Relatórios' }, ...(showAdministration ? [{ to: '/administracao' as const, name: 'Administração' }] : [])] as const;
  return <header className="atlas-header"><div className="atlas-header-inner"><Brand /><Button variant="ghost" size="icon" className="mobile-menu" aria-label={open ? 'Fechar navegação' : 'Abrir navegação'} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</Button><nav className={`atlas-nav ${open ? 'is-open' : ''}`} aria-label="Navegação principal">{items.map(item => <Link key={item.to} to={item.to} onClick={() => setOpen(false)} className={pathname.startsWith(item.to) ? 'nav-active' : ''}>{item.name}</Link>)}</nav><div className="atlas-user"><NotificationBell /><span className="user-avatar" title={email || 'Equipe Atlas'}>{email ? email.slice(0, 2).toUpperCase() : 'AT'}</span><Button variant="ghost" size="icon" aria-label="Sair da conta" title="Sair da conta" onClick={async () => { await supabase.auth.signOut(); }}><LogOut /></Button></div></div></header>;
}
