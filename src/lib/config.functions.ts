import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

function friendly(error: { message: string } | null, fallback: string): never {
  throw new Error(error?.message && !/permission|row-level|JWT|PGRST/i.test(error.message) ? translate(error.message) : fallback);
}
function translate(message: string) {
  if (/business_calendars_hours/.test(message)) return 'O fim do expediente deve ser depois do início.';
  if (/business_calendars_days/.test(message)) return 'Selecione ao menos um dia útil.';
  if (/sla_targets_positive/.test(message)) return 'As metas devem ser positivas e a 1ª resposta não pode superar a solução.';
  if (/duplicate key/.test(message)) return 'Este registro já existe.';
  if (/violates foreign key/.test(message)) return 'O registro está em uso e não pode ser removido.';
  if (/_name/.test(message) && /check/.test(message)) return 'Revise o nome informado.';
  return message;
}

function assertAdmin(role: { data: unknown; error: unknown }) {
  if (role.error || role.data !== 'admin') throw new Error('Somente o administrador pode alterar a configuração.');
}

export const getSlaConfig = createServerFn()
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [calendars, holidays, policies, targets, categories, accounts, role] = await Promise.all([
      context.supabase.from('business_calendars').select('*').order('name'),
      context.supabase.from('holidays').select('*').order('day'),
      context.supabase.from('sla_policies').select('*').order('name'),
      context.supabase.from('sla_targets').select('*'),
      context.supabase.from('categories').select('*').order('name'),
      context.supabase.from('accounts').select('id,name,calendar_id,sla_policy_id,active').order('name'),
      context.supabase.rpc('current_app_role'),
    ]);
    for (const r of [calendars, holidays, policies, targets, categories, accounts, role]) if (r.error) throw new Error('Não foi possível carregar a configuração.');
    const audit = role.data === 'admin' ? await context.supabase.from('config_audit').select('*').order('created_at', { ascending: false }).limit(40) : { data: [], error: null };
    const actorIds = [...new Set((audit.data ?? []).map((a) => a.actor_id).filter((v): v is string => Boolean(v)))];
    const actors = actorIds.length ? await context.supabase.from('profiles').select('id,full_name').in('id', actorIds) : { data: [] };
    return {
      calendars: calendars.data ?? [],
      holidays: holidays.data ?? [],
      policies: policies.data ?? [],
      targets: targets.data ?? [],
      categories: categories.data ?? [],
      accounts: accounts.data ?? [],
      audit: audit.data ?? [],
      actors: Object.fromEntries((actors.data ?? []).map((a) => [a.id, a.full_name])),
      canEdit: role.data === 'admin',
    };
  });

const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Informe o horário no formato HH:MM.');

export const saveCalendar = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid().nullable(), name: z.string().trim().min(2, 'Informe o nome.').max(80), timezone: z.string().trim().min(3).max(60), workStart: time, workEnd: time, workDays: z.array(z.number().int().min(1).max(7)).min(1, 'Selecione ao menos um dia útil.').max(7) }))
  .handler(async ({ context, data }) => {
    assertAdmin(await context.supabase.rpc('current_app_role'));
    const row = { name: data.name, timezone: data.timezone, work_start: data.workStart, work_end: data.workEnd, work_days: [...new Set(data.workDays)].sort() };
    const r = data.id ? await context.supabase.from('business_calendars').update(row).eq('id', data.id).select('id').single() : await context.supabase.from('business_calendars').insert(row).select('id').single();
    if (r.error) friendly(r.error, 'Não foi possível salvar o calendário.');
    return r.data;
  });

export const addHoliday = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ calendarId: z.string().uuid(), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data.'), description: z.string().trim().min(2, 'Descreva o feriado.').max(120) }))
  .handler(async ({ context, data }) => {
    assertAdmin(await context.supabase.rpc('current_app_role'));
    const r = await context.supabase.from('holidays').insert({ calendar_id: data.calendarId, day: data.day, description: data.description });
    if (r.error) friendly(r.error, 'Não foi possível incluir o feriado.');
    return { ok: true };
  });

export const removeHoliday = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ calendarId: z.string().uuid(), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
  .handler(async ({ context, data }) => {
    assertAdmin(await context.supabase.rpc('current_app_role'));
    const r = await context.supabase.from('holidays').delete().eq('calendar_id', data.calendarId).eq('day', data.day);
    if (r.error) friendly(r.error, 'Não foi possível remover o feriado.');
    return { ok: true };
  });

export const createPolicy = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ name: z.string().trim().min(2, 'Informe o nome da política.').max(80), copyFrom: z.string().uuid('Selecione a política de origem.') }))
  .handler(async ({ context, data }) => {
    assertAdmin(await context.supabase.rpc('current_app_role'));
    const r = await context.supabase.rpc('create_sla_policy', { p_name: data.name, p_copy_from: data.copyFrom });
    if (r.error) friendly(r.error, 'Não foi possível criar a política.');
    return { id: r.data as string };
  });

const minutes = z.number().int().min(1, 'Use valores positivos.').max(525600, 'Valor muito alto.');

export const savePolicy = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), name: z.string().trim().min(2).max(80), targets: z.array(z.object({ severity: z.enum(['S1', 'S2', 'S3', 'S4']), firstResponse: minutes, resolution: minutes, update: minutes })).length(4) }))
  .handler(async ({ context, data }) => {
    assertAdmin(await context.supabase.rpc('current_app_role'));
    for (const t of data.targets) if (t.firstResponse > t.resolution) throw new Error(`Em ${t.severity}, a 1ª resposta não pode superar o prazo de solução.`);
    const named = await context.supabase.from('sla_policies').update({ name: data.name }).eq('id', data.id);
    if (named.error) friendly(named.error, 'Não foi possível salvar a política.');
    for (const t of data.targets) {
      const r = await context.supabase.from('sla_targets').update({ first_response_minutes: t.firstResponse, resolution_minutes: t.resolution, update_interval_minutes: t.update }).eq('policy_id', data.id).eq('severity', t.severity);
      if (r.error) friendly(r.error, 'Não foi possível salvar as metas.');
    }
    return { ok: true };
  });

export const saveCategory = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid().nullable(), name: z.string().trim().min(2, 'Informe o nome.').max(80), parentId: z.string().uuid().nullable(), active: z.boolean() }))
  .handler(async ({ context, data }) => {
    assertAdmin(await context.supabase.rpc('current_app_role'));
    const row = { name: data.name, parent_id: data.parentId, active: data.active };
    const r = data.id ? await context.supabase.from('categories').update(row).eq('id', data.id).select('id').single() : await context.supabase.from('categories').insert(row).select('id').single();
    if (r.error) friendly(r.error, 'Não foi possível salvar a categoria.');
    return r.data;
  });
