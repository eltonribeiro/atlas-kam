import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

function friendly(error: { message: string } | null, fallback: string): never {
  throw new Error(error?.message && !/permission|violates|row-level|JWT|PGRST/i.test(error.message) ? error.message : fallback);
}

export const problemFiltersSchema = z.object({
  status: z.enum(['active', 'open', 'analysis', 'action_plan', 'effectiveness_check', 'closed', 'cancelled', 'all']).optional().catch(undefined),
  account: z.string().uuid().optional().catch(undefined),
  owner: z.string().uuid().optional().catch(undefined),
});

export const listProblems = createServerFn()
  .middleware([requireSupabaseAuth])
  .inputValidator(problemFiltersSchema)
  .handler(async ({ context, data }) => {
    let q = context.supabase.from('v_problem_list').select('*').order('created_at', { ascending: false }).limit(500);
    const status = data.status ?? 'active';
    if (status === 'active') q = q.not('status', 'in', '(closed,cancelled)');
    else if (status !== 'all') q = q.eq('status', status);
    if (data.account) q = q.eq('account_id', data.account);
    if (data.owner) q = q.eq('owner_id', data.owner);
    const [rows, role, accounts, categories] = await Promise.all([
      q,
      context.supabase.rpc('current_app_role'),
      context.supabase.from('accounts').select('id,name').eq('active', true).order('name'),
      context.supabase.from('categories').select('id,name').is('parent_id', null).eq('active', true).order('name'),
    ]);
    if (rows.error || role.error || accounts.error || categories.error) throw new Error('Não foi possível carregar os problemas.');
    const owners = new Map<string, string>();
    for (const r of rows.data ?? []) if (r.owner_id && r.owner_name) owners.set(r.owner_id, r.owner_name);
    return { rows: rows.data ?? [], role: role.data, accounts: accounts.data ?? [], categories: categories.data ?? [], owners: [...owners].map(([id, name]) => ({ id, name })) };
  });

export const getProblem = createServerFn()
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const p = await context.supabase.from('v_problem_list').select('*').eq('id', data.id).maybeSingle();
    if (p.error) throw new Error('Não foi possível carregar o problema.');
    if (!p.data) return null;
    const [details, occurrences, causes, actions, events, transitions, role] = await Promise.all([
      context.supabase.from('problems').select('effectiveness_criteria,effectiveness_evidence,effectiveness_checked_at,created_by').eq('id', data.id).single(),
      context.supabase.from('occurrences').select('id,protocol,subject,status,severity,created_at,accounts(name)').eq('problem_id', data.id).order('created_at', { ascending: false }),
      context.supabase.from('causes').select('*').eq('problem_id', data.id).order('created_at'),
      context.supabase.from('actions').select('*').eq('problem_id', data.id).order('due_date'),
      context.supabase.from('problem_events').select('*').eq('problem_id', data.id).order('created_at', { ascending: false }),
      context.supabase.rpc('available_problem_transitions', { p_problem_id: data.id }),
      context.supabase.rpc('current_app_role'),
    ]);
    for (const r of [details, occurrences, causes, actions, events, transitions, role]) if (r.error) throw new Error('Não foi possível carregar o problema.');
    const team = await context.supabase.rpc('problem_team', { p_problem_id: data.id });
    const members = (Array.isArray(team.data) ? team.data : []) as { id: string; full_name: string; role: string }[];
    const authorIds = [...new Set((events.data ?? []).map((e) => e.author_id).filter((v): v is string => Boolean(v)))];
    const authors = authorIds.length ? await context.supabase.from('profiles').select('id,full_name').in('id', authorIds) : { data: [] };
    return {
      problem: { ...p.data, ...details.data },
      occurrences: occurrences.data ?? [],
      causes: causes.data ?? [],
      actions: actions.data ?? [],
      events: events.data ?? [],
      authors: Object.fromEntries((authors.data ?? []).map((a) => [a.id, a.full_name])),
      transitions: transitions.data,
      role: role.data,
      userId: context.userId,
      team: members,
    };
  });

export const createProblem = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ title: z.string().trim().min(5, 'O título precisa de pelo menos 5 caracteres.').max(140), accountId: z.string().uuid().nullable(), categoryId: z.string().uuid().nullable(), occurrenceId: z.string().uuid().nullable() }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.rpc('create_problem', { p_title: data.title, p_account_id: data.accountId as string, p_category_id: data.categoryId as string, p_occurrence_id: data.occurrenceId ?? undefined });
    if (r.error) friendly(r.error, 'Não foi possível criar o problema.');
    return { id: r.data as string };
  });

export const linkProblem = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ occurrenceId: z.string().uuid(), problemId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.rpc('link_occurrence_to_problem', { p_occurrence_id: data.occurrenceId, p_problem_id: data.problemId });
    if (r.error) friendly(r.error, 'Não foi possível vincular ao problema.');
    const { dispatchForOccurrence } = await import('./notifications.server');
    await dispatchForOccurrence(data.occurrenceId);
    return { ok: true };
  });

export const transitionProblem = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      action: z.enum(['assign_owner', 'start_analysis', 'plan_actions', 'start_verification', 'record_effectiveness', 'cancel']),
      body: z.string().trim().max(4000).optional(),
      ownerId: z.string().uuid().optional(),
      criteria: z.string().trim().max(1000).optional(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      effective: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    if (data.action === 'start_verification' && !/\d/.test(data.criteria ?? '')) throw new Error('O critério de eficácia deve ser mensurável e conter número ou percentual.');
    const payload: Record<string, string | boolean> = {};
    if (data.body) payload['body'] = data.body;
    if (data.ownerId) payload['owner_id'] = data.ownerId;
    if (data.criteria) payload['criteria'] = data.criteria;
    if (data.dueDate) payload['due_date'] = data.dueDate;
    if (data.effective !== undefined) payload['effective'] = data.effective;
    const r = await context.supabase.rpc('transition_problem', { p_problem_id: data.id, p_action: data.action, p_payload: payload });
    if (r.error) friendly(r.error, 'Não foi possível atualizar o problema.');
    const { processDispatches } = await import('./notifications.server');
    const { getRequest } = await import('@tanstack/react-start/server');
    try { await processDispatches({ limit: 10, origin: new URL(getRequest().url).origin }); } catch (error) { console.error('Atlas problem dispatch deferred', error); }
    return r.data;
  });
