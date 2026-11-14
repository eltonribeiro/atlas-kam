import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

export const listNotifications = createServerFn()
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [rows, unread] = await Promise.all([
      context.supabase.from('notifications').select('id,kind,title,body,occurrence_id,problem_id,read_at,created_at').eq('user_id', context.userId).order('created_at', { ascending: false }).limit(30),
      context.supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', context.userId).is('read_at', null),
    ]);
    if (rows.error || unread.error) throw new Error('Não foi possível carregar as notificações.');
    return { rows: rows.data ?? [], unread: unread.count ?? 0 };
  });

export const markNotificationsRead = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ ids: z.array(z.string().uuid()).max(100).nullable() }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.rpc('mark_notifications_read', data.ids ? { p_ids: data.ids } : {});
    if (r.error) throw new Error('Não foi possível atualizar as notificações.');
    return { updated: r.data ?? 0 };
  });
