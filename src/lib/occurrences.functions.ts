import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { staffNames } from './staff-names';
import { CLOSED_STATUSES, PAGE_SIZE, occurrenceFiltersSchema, sanitizeSearch } from './occurrence-filters';

const idSchema = z.object({ id: z.string().uuid() });
const level = z.enum(['high', 'medium', 'low']);

function friendly(error: { message: string } | null, fallback: string): never {
  throw new Error(error?.message && !/permission|violates|row-level|JWT|PGRST/i.test(error.message) ? error.message : fallback);
}

export const getOccurrenceCatalog = createServerFn()
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [accounts, contacts, categories, role] = await Promise.all([
      context.supabase.from('accounts').select('*').eq('active', true).order('name'),
      context.supabase.from('account_contacts').select('id,account_id,name,job_title,active').eq('active', true).order('name'),
      context.supabase.from('categories').select('*').eq('active', true).order('name'),
      context.supabase.rpc('current_app_role'),
    ]);
    for (const r of [accounts, contacts, categories, role]) if (r.error) throw new Error('Não foi possível carregar os cadastros.');
    return { accounts: accounts.data ?? [], contacts: contacts.data ?? [], categories: categories.data ?? [], role: role.data, userId: context.userId };
  });

type AppClient = SupabaseClient<Database>;

function filteredOccurrences(supabase: AppClient, filters: z.infer<typeof occurrenceFiltersSchema>, withCount: boolean) {
  let q = supabase.from('v_occurrence_list').select('*', withCount ? { count: 'exact' } : undefined);
  const status = filters.status ?? 'open';
  const closed = `(${CLOSED_STATUSES.join(',')})`;
  if (status === 'open') q = q.not('status', 'in', closed);
  if (status === 'closed') q = q.in('status', [...CLOSED_STATUSES]);
  if (filters.account) q = q.eq('account_id', filters.account);
  if (filters.severity) q = q.eq('severity', filters.severity);
  if (filters.category) q = q.eq('category_id', filters.category);
  if (filters.risk) q = q.lte('sort_rank', 1).not('status', 'in', closed);
  const search = sanitizeSearch(filters.q);
  if (search) q = q.ilike('search_text', `%${search}%`);
  return q.order('sort_rank').order('resolution_due_at').order('protocol');
}

export const listOccurrences = createServerFn()
  .middleware([requireSupabaseAuth])
  .inputValidator(occurrenceFiltersSchema)
  .handler(async ({ context, data }) => {
    const page = data.page ?? 1;
    const r = await filteredOccurrences(context.supabase, data, true).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (r.error) throw new Error('Não foi possível carregar as ocorrências.');
    return { rows: r.data ?? [], total: r.count ?? 0, page, pageSize: PAGE_SIZE };
  });

export const exportOccurrences = createServerFn()
  .middleware([requireSupabaseAuth])
  .inputValidator(occurrenceFiltersSchema)
  .handler(async ({ context, data }) => {
    const r = await filteredOccurrences(context.supabase, data, false).limit(5000);
    if (r.error) throw new Error('Não foi possível exportar as ocorrências.');
    return r.data ?? [];
  });

export const getOccurrence = createServerFn()
  .middleware([requireSupabaseAuth])
  .inputValidator(idSchema)
  .handler(async ({ context, data }) => {
    const occ = await context.supabase
      .from('occurrences')
      .select('*,accounts(name,kam_id),categories!occurrences_category_id_fkey(name),account_contacts(name,job_title)')
      .eq('id', data.id)
      .maybeSingle();
    if (occ.error) throw new Error('Não foi possível carregar a tratativa.');
    if (!occ.data) return null;
    const o = occ.data;
    const [events, actions, causes, transitions, sla, team, recurrence, role, evaluation, surveyDispatch, problem, subcategory] = await Promise.all([
      context.supabase.from('occurrence_events').select('*').eq('occurrence_id', data.id).order('created_at', { ascending: false }).order('id', { ascending: false }),
      context.supabase.from('actions').select('*').eq('occurrence_id', data.id).order('due_date'),
      context.supabase.from('causes').select('*').eq('occurrence_id', data.id).order('created_at'),
      context.supabase.rpc('available_transitions', { p_occurrence_id: data.id }),
      context.supabase.from('v_occurrence_sla').select('*').eq('id', data.id).maybeSingle(),
      context.supabase.rpc('account_team', { p_account_id: o.account_id }),
      context.supabase.rpc('occurrence_recurrence', { p_occurrence_id: data.id }),
      context.supabase.rpc('current_app_role'),
      context.supabase.from('evaluations').select('id,cycle,sent_at,invite_sent_at,answered_at,resolved,csat,ces,reminders_sent,token_expires_at').eq('occurrence_id', data.id).order('cycle', { ascending: false }).limit(1).maybeSingle(),
      context.supabase.from('email_dispatches').select('status,last_error,created_at,attempts').eq('occurrence_id', data.id).eq('link_purpose', 'evaluation').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      o.problem_id ? context.supabase.from('problems').select('id,code,title,status,effectiveness_criteria,effectiveness_due_date,effectiveness_effective').eq('id', o.problem_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      o.subcategory_id ? context.supabase.from('categories').select('name').eq('id', o.subcategory_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    for (const r of [events, actions, causes, transitions, sla, team, recurrence, role, evaluation, surveyDispatch, problem, subcategory]) if (r.error) throw new Error('Não foi possível carregar a tratativa.');
    const names = await staffNames(context.supabase, [o.assignee_id, o.accounts?.kam_id, ...(events.data ?? []).map((e) => e.author_id), ...(actions.data ?? []).map((a) => a.owner_id)]);
    return {
      occurrence: o,
      subcategoryName: subcategory.data?.name ?? null,
      assigneeName: o.assignee_id ? (names[o.assignee_id] ?? null) : null,
      kamName: o.accounts?.kam_id ? (names[o.accounts.kam_id] ?? null) : null,
      events: events.data ?? [],
      authors: names,
      actions: actions.data ?? [],
      causes: causes.data ?? [],
      transitions: transitions.data,
      sla: sla.data,
      team: (Array.isArray(team.data) ? team.data : []) as { id: string; full_name: string; role: string }[],
      recurrence: recurrence.data as { same_account_90d: number; same_category_90d: number; suggest: boolean; open_problems: { id: string; code: string; title: string; status: string }[] } | null,
      role: role.data,
      userId: context.userId,
      evaluation: evaluation.data,
      surveyDispatch: surveyDispatch.data,
      problem: problem.data,
    };
  });

export const previewSla = createServerFn()
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ accountId: z.string().uuid(), impact: level, urgency: level }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.rpc('preview_sla', { p_account_id: data.accountId, p_impact: data.impact, p_urgency: data.urgency });
    if (r.error) friendly(r.error, 'Não foi possível calcular o SLA.');
    return r.data;
  });

export const occurrenceSchema = z.object({
  account_id: z.string({ required_error: 'Selecione a conta.' }).uuid('Selecione a conta.'),
  contact_id: z.string({ required_error: 'Selecione o contato.' }).uuid('Selecione o contato cadastrado.'),
  channel: z.enum(['portal', 'email', 'phone', 'whatsapp', 'account_meeting', 'site_visit'], { errorMap: () => ({ message: 'Selecione o canal.' }) }),
  type: z.enum(['complaint', 'incident', 'request']),
  category_id: z.string({ required_error: 'Selecione a categoria.' }).uuid('Selecione a categoria.'),
  subcategory_id: z.string().uuid().nullable().optional(),
  subject: z.string().trim().min(5, 'O assunto precisa de pelo menos 5 caracteres.').max(140, 'O assunto pode ter até 140 caracteres.'),
  description: z.string().trim().min(1, 'Descreva o relato do cliente.').max(8000, 'Relato muito longo.'),
  customer_expectation: z.string().trim().min(1, 'Informe o que o cliente espera como solução.').max(4000, 'Texto muito longo.'),
  references_text: z.string().trim().max(500, 'Referências muito longas.').optional(),
  financial_impact: z.number({ invalid_type_error: 'Informe um valor numérico.' }).min(0, 'O impacto financeiro não pode ser negativo.').max(999999999999, 'Valor muito alto.').nullable(),
  occurred_at: z.string().nullable().refine((v) => !v || new Date(v).getTime() <= Date.now() + 60000, 'A data da ocorrência não pode ser futura.'),
  impact: level,
  urgency: level,
});

export const registerOccurrence = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(occurrenceSchema)
  .handler(async ({ context, data }) => {
    const now = new Date().toISOString();
    const r = await context.supabase
      .from('occurrences')
      .insert({ ...data, references_text: data.references_text || null, subcategory_id: data.subcategory_id ?? null, created_by: context.userId, severity: 'S4', protocol: 'pending', resolution_started_at: now, first_response_due_at: now, resolution_due_at: now })
      .select('id,protocol')
      .single();
    if (r.error) friendly(r.error, 'Não foi possível registrar a ocorrência.');
    const { dispatchForOccurrence } = await import('./notifications.server');
    await dispatchForOccurrence(r.data.id);
    return r.data;
  });

export const transitionOccurrence = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), action: z.string().max(40), body: z.string().max(8000) }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.rpc('transition_occurrence', { p_occurrence_id: data.id, p_action: data.action, p_payload: { body: data.body } });
    if (r.error) friendly(r.error, 'Não foi possível concluir a ação.');
    const { dispatchForOccurrence } = await import('./notifications.server');
    await dispatchForOccurrence(data.id);
    return r.data;
  });

export const communicateOccurrence = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), kind: z.enum(['customer_update', 'internal_note']), body: z.string().trim().min(1, 'Escreva a mensagem.').max(8000) }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.rpc('communicate_occurrence', { p_occurrence_id: data.id, p_kind: data.kind, p_body: data.body });
    if (r.error) friendly(r.error, 'Não foi possível registrar a mensagem.');
    if (data.kind === 'customer_update') {
      const { dispatchForOccurrence } = await import('./notifications.server');
      await dispatchForOccurrence(data.id);
    }
    return { ok: true };
  });

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));

export const addAction = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      occurrenceId: z.string().uuid().nullable(),
      problemId: z.string().uuid().nullable(),
      type: z.enum(['containment', 'correction', 'corrective', 'preventive']),
      what: z.string().trim().min(3, 'Descreva o que será feito.').max(500),
      why: optionalText(1000),
      where: optionalText(300),
      how: optionalText(1000),
      howMuch: z.number().min(0, 'O custo não pode ser negativo.').max(999999999999).nullable(),
      ownerId: z.string().uuid('Selecione o responsável.'),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe o prazo.'),
      causeId: z.string().uuid().nullable(),
    }).refine((v) => v.occurrenceId || v.problemId, 'Ação sem vínculo.'),
  )
  .handler(async ({ context, data }) => {
    if ((data.type === 'corrective' || data.type === 'preventive') && !data.causeId) throw new Error('Ações corretivas e preventivas precisam indicar a causa tratada.');
    const r = await context.supabase.from('actions').insert({
      occurrence_id: data.occurrenceId,
      problem_id: data.problemId,
      type: data.type,
      what: data.what,
      why: data.why,
      where_text: data.where,
      how: data.how,
      how_much: data.howMuch,
      owner_id: data.ownerId,
      due_date: data.dueDate,
      cause_id: data.causeId,
    });
    if (r.error) friendly(r.error, 'Não foi possível salvar a ação. Verifique se você pode editar este plano.');
    return { ok: true };
  });

const causeFields = {
  description: z.string().trim().min(3, 'Descreva a causa.').max(2000),
  kind: z.enum(['root', 'contributing']),
  status: z.enum(['hypothesis', 'validating', 'confirmed', 'discarded']),
  category: z.enum(['method', 'machine', 'manpower', 'material', 'measurement', 'environment']).nullable(),
  evidence: z.string().trim().max(2000),
  whys: z.array(z.string().trim().min(1).max(500)).max(7, 'Use até 7 níveis de porquês.'),
};

export const addCause = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ occurrenceId: z.string().uuid().nullable(), problemId: z.string().uuid().nullable(), ...causeFields }).refine((v) => v.occurrenceId || v.problemId, 'Causa sem vínculo.'))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.from('causes').insert({
      occurrence_id: data.occurrenceId,
      problem_id: data.problemId,
      description: data.description,
      kind: data.kind,
      status: data.status,
      category: data.category,
      evidence: data.evidence || null,
      whys: data.whys,
      created_by: context.userId,
      code: 'pending',
    });
    if (r.error) friendly(r.error, 'Não foi possível salvar a causa. Verifique se você pode editar esta análise.');
    return { ok: true };
  });

export const updateCause = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), ...causeFields }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase
      .from('causes')
      .update({ description: data.description, kind: data.kind, status: data.status, category: data.category, evidence: data.evidence || null, whys: data.whys })
      .eq('id', data.id)
      .select('id')
      .maybeSingle();
    if (r.error || !r.data) friendly(r.error, 'Não foi possível atualizar a causa.');
    return { ok: true };
  });

export const completeAction = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), evidence: z.string().trim().min(5, 'Descreva a evidência da conclusão.').max(2000) }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.from('actions').update({ status: 'done', done_at: new Date().toISOString(), evidence_note: data.evidence }).eq('id', data.id).select('id').maybeSingle();
    if (r.error || !r.data) friendly(r.error, 'Não foi possível concluir a ação. Somente o dono da ação, o responsável, o KAM ou o gestor podem concluí-la.');
    return r.data;
  });

export const reviseClassification = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), impact: level, urgency: level, categoryId: z.string().uuid(), reason: z.string().trim().min(5, 'Justifique a revisão.').max(2000) }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.rpc('revise_occurrence_classification', { p_occurrence_id: data.id, p_impact: data.impact, p_urgency: data.urgency, p_category_id: data.categoryId, p_reason: data.reason });
    if (r.error) friendly(r.error, 'Não foi possível revisar a classificação.');
    return { ok: true };
  });

export const reassignOccurrence = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), userId: z.string().uuid('Selecione o novo responsável.'), reason: z.string().trim().min(5, 'Informe o motivo da reatribuição.').max(1000) }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.rpc('reassign_occurrence', { p_occurrence_id: data.id, p_user_id: data.userId, p_reason: data.reason });
    if (r.error) friendly(r.error, 'Não foi possível reatribuir a ocorrência.');
    const { dispatchForOccurrence } = await import('./notifications.server');
    await dispatchForOccurrence(data.id);
    return { ok: true };
  });

export const escalateOccurrence = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), reason: z.string().trim().min(10, 'Descreva o motivo com pelo menos 10 caracteres.').max(1000) }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.rpc('escalate_occurrence', { p_occurrence_id: data.id, p_reason: data.reason });
    if (r.error) friendly(r.error, 'Não foi possível escalar a ocorrência.');
    const { dispatchForOccurrence } = await import('./notifications.server');
    await dispatchForOccurrence(data.id);
    return { ok: true };
  });

export const resendEvaluation = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(idSchema)
  .handler(async ({ context, data }) => {
    const r = await context.supabase.rpc('resend_evaluation_invite', { p_occurrence_id: data.id });
    if (r.error) friendly(r.error, 'Não foi possível reenviar a pesquisa.');
    const { dispatchForOccurrence } = await import('./notifications.server');
    await dispatchForOccurrence(data.id);
    return { ok: true };
  });

export const getContestations = createServerFn()
  .middleware([requireSupabaseAuth])
  .inputValidator(idSchema)
  .handler(async ({ context, data }) => {
    const [rows, role] = await Promise.all([
      context.supabase.from('occurrence_contestations').select('*').eq('occurrence_id', data.id).order('created_at'),
      context.supabase.rpc('current_app_role'),
    ]);
    if (rows.error || role.error) throw new Error('Não foi possível carregar as contestações.');
    return { rows: rows.data ?? [], canReview: role.data === 'kam' || role.data === 'ops_manager' };
  });

export const reviewContestation = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), decision: z.enum(['uphold', 'reopen']), reason: z.string().trim().min(5, 'Justifique a decisão.').max(2000) }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.rpc('review_unfounded_contestation', { p_id: data.id, p_decision: data.decision, p_reason: data.reason });
    if (r.error) friendly(r.error, 'Não foi possível concluir a revisão.');
    return { ok: true };
  });
