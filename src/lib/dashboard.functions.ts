import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

export type KpiWindow = {
  resolution_index: number | null; resolution_index_n: number;
  first_response_sla: number | null; first_response_n: number;
  solution_sla: number | null; solution_n: number;
  first_response_avg_minutes: number | null; solution_avg_minutes: number | null; solution_avg_days: number | null;
  csat: number | null; ces: number | null; evaluations_answered: number;
  response_rate: number | null; surveys_sent: number; surveys_answered: number;
  reopen_rate: number | null; closures_n: number; reopened_n: number;
};

export const getDashboard = createServerFn()
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), accountId: z.string().uuid().nullable() }))
  .handler(async ({ context, data }) => {
    const account = data.accountId ? { p_account_id: data.accountId } : {};
    const [kpis, pareto, aging] = await Promise.all([
      context.supabase.rpc('dashboard_kpis', { p_from: data.from, p_to: data.to, ...account }),
      context.supabase.rpc('occurrence_pareto', account),
      context.supabase.rpc('backlog_aging', account),
    ]);
    if (kpis.error || pareto.error || aging.error) throw new Error('Não foi possível calcular os indicadores.');
    const k = kpis.data as { current: KpiWindow; previous: KpiWindow; from: string; to: string; previous_from: string };
    return {
      current: k.current,
      previous: k.previous,
      range: { from: k.from, to: k.to, previousFrom: k.previous_from },
      pareto: pareto.data as { total: number; open_problems: number; items: { label: string; count: number; percent: number }[] },
      aging: aging.data as { d0_2: number; d3_5: number; d6_10: number; d10_plus: number; total: number },
    };
  });

export const getAccountReport = createServerFn()
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), accountId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const start = new Date(`${data.from}T00:00:00-03:00`).toISOString();
    const end = new Date(new Date(`${data.to}T00:00:00-03:00`).getTime() + 86400000).toISOString();
    const [account, occurrences, problems] = await Promise.all([
      context.supabase.from('accounts').select('id,name').eq('id', data.accountId).maybeSingle(),
      context.supabase.from('v_occurrence_list').select('*').eq('account_id', data.accountId).gte('created_at', start).lt('created_at', end).order('created_at', { ascending: false }).limit(1000),
      context.supabase.from('v_problem_list').select('*').eq('account_id', data.accountId).order('created_at', { ascending: false }).limit(100),
    ]);
    if (account.error || occurrences.error || problems.error) throw new Error('Não foi possível montar o relatório.');
    if (!account.data) throw new Error('Conta sem acesso ou inexistente.');
    return { account: account.data, occurrences: occurrences.data ?? [], problems: problems.data ?? [] };
  });
