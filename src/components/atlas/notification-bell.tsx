import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { listNotifications, markNotificationsRead } from '@/lib/notifications.functions';
import { formatShortDateTime } from './occurrence-ui';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const list = useServerFn(listNotifications);
  const mark = useServerFn(markNotificationsRead);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['notifications'], queryFn: () => list(), refetchInterval: 60000, refetchOnWindowFocus: true });
  const read = useMutation({
    mutationFn: (ids: string[] | null) => mark({ data: { ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const unread = query.data?.unread ?? 0;
  const rows = query.data?.rows ?? [];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="bell-button" aria-label={unread ? `Notificações: ${unread} não lidas` : 'Notificações'}>
          <Bell />
          {unread > 0 && <span className="bell-count font-mono">{unread > 99 ? '99+' : unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="notification-panel">
        <div className="notification-head">
          <strong>Notificações</strong>
          <Button variant="ghost" size="sm" disabled={!unread || read.isPending} onClick={() => read.mutate(null)}><CheckCheck />Marcar todas como lidas</Button>
        </div>
        {query.isPending ? <p className="notification-empty">Carregando…</p> : query.error ? <p className="notification-empty" role="alert">Não foi possível carregar as notificações.</p> : !rows.length ? <p className="notification-empty">Nenhuma notificação por enquanto.</p> : (
          <ul className="notification-list">
            {rows.map((n) => {
              const content = <><span className="notification-title">{n.title}</span>{n.body && <span className="notification-body">{n.body}</span>}<span className="notification-time font-mono">{formatShortDateTime(n.created_at)}</span></>;
              const onClick = () => { if (!n.read_at) read.mutate([n.id]); setOpen(false); };
              return (
                <li key={n.id} className={n.read_at ? '' : 'is-unread'}>
                  {n.occurrence_id ? <Link to="/ocorrencias/$id" params={{ id: n.occurrence_id }} onClick={onClick}>{content}</Link>
                    : n.problem_id ? <Link to="/problemas/$id" params={{ id: n.problem_id }} onClick={onClick}>{content}</Link>
                    : <button type="button" onClick={onClick}>{content}</button>}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
