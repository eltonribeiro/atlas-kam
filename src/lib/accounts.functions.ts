import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

function friendly(error: { message: string } | null, fallback: string): never {
  const m = error?.message ?? '';
  if (/account_contacts_email/.test(m)) throw new Error('Informe um e-mail válido para o contato.');
  if (/accounts_name/.test(m)) throw new Error('Informe o nome da conta.');
  if (/duplicate key/.test(m)) throw new Error('Este registro já existe.');
  throw new Error(m && !/permission|row-level|JWT|PGRST|violates/i.test(m) ? m : fallback);
}

type RoleClient = { supabase: { rpc: (fn: 'current_app_role') => PromiseLike<{ data: unknown; error: unknown }> } };
async function requireAdmin(context: RoleClient) {
  const role = await context.supabase.rpc('current_app_role');
  if (role.error || role.data !== 'admin') throw new Error('Somente o administrador pode alterar cadastros.');
}

export type StaffMember = { id: string; full_name: string; active: boolean; email: string; role: 'analyst' | 'kam' | 'ops_manager' | 'admin' | null; accounts: string[] };

export const getAccountsOverview = createServerFn()
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await context.supabase.rpc('current_app_role');
    if (role.error) throw new Error('Não foi possível carregar as contas.');
    const isAdmin = role.data === 'admin';
    const [accounts, contacts, calendars, policies] = await Promise.all([
      context.supabase.from('accounts').select('*').order('name'),
      context.supabase.from('account_contacts').select('*').order('name'),
      context.supabase.from('business_calendars').select('id,name').order('name'),
      context.supabase.from('sla_policies').select('id,name').order('name'),
    ]);
    for (const r of [accounts, contacts, calendars, policies]) if (r.error) throw new Error('Não foi possível carregar as contas.');
    const staff = isAdmin ? await context.supabase.rpc('admin_staff') : { data: [], error: null };
    if (staff.error) throw new Error('Não foi possível carregar a equipe.');
    const kamIds = [...new Set((accounts.data ?? []).map((a) => a.kam_id).filter((v): v is string => Boolean(v)))];
    const kams = kamIds.length ? await context.supabase.from('profiles').select('id,full_name').in('id', kamIds) : { data: [] };
    return {
      isAdmin,
      role: role.data,
      userId: context.userId,
      accounts: accounts.data ?? [],
      contacts: (contacts.data ?? []).map((c) => (isAdmin ? c : { ...c, email: '' })),
      calendars: calendars.data ?? [],
      policies: policies.data ?? [],
      staff: (Array.isArray(staff.data) ? staff.data : []) as StaffMember[],
      kamNames: Object.fromEntries((kams.data ?? []).map((k) => [k.id, k.full_name])),
    };
  });

export const saveAccount = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid().nullable(), name: z.string().trim().min(2, 'Informe o nome da conta.').max(120), kamId: z.string().uuid().nullable(), calendarId: z.string().uuid('Selecione o calendário.'), policyId: z.string().uuid('Selecione a política de SLA.'), active: z.boolean() }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const row = { name: data.name, kam_id: data.kamId, calendar_id: data.calendarId, sla_policy_id: data.policyId, active: data.active };
    const r = data.id ? await context.supabase.from('accounts').update(row).eq('id', data.id).select('id').single() : await context.supabase.from('accounts').insert(row).select('id').single();
    if (r.error) friendly(r.error, 'Não foi possível salvar a conta.');
    return r.data;
  });

export const saveContact = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid().nullable(), accountId: z.string().uuid(), name: z.string().trim().min(2, 'Informe o nome do contato.').max(120), email: z.string().trim().toLowerCase().email('Informe um e-mail válido.').max(200), jobTitle: z.string().trim().max(120), active: z.boolean() }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const row = { account_id: data.accountId, name: data.name, email: data.email, job_title: data.jobTitle || null, active: data.active };
    const r = data.id ? await context.supabase.from('account_contacts').update(row).eq('id', data.id).select('id').single() : await context.supabase.from('account_contacts').insert(row).select('id').single();
    if (r.error) friendly(r.error, 'Não foi possível salvar o contato.');
    return r.data;
  });

export const anonymizeContact = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), reference: z.string().trim().min(3, 'Informe a referência do pedido do titular.').max(200) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const r = await context.supabase.rpc('anonymize_contact', { p_contact_id: data.id, p_reference: data.reference });
    if (r.error) friendly(r.error, 'Não foi possível anonimizar o contato.');
    return { ok: true };
  });

export const setMembership = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ accountId: z.string().uuid(), userId: z.string().uuid(), member: z.boolean() }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    if (!data.member) {
      const account = await context.supabase.from('accounts').select('kam_id').eq('id', data.accountId).single();
      if (account.data?.kam_id === data.userId) throw new Error('Troque o KAM da conta antes de remover esta alocação.');
    }
    const r = data.member
      ? await context.supabase.from('account_members').upsert({ account_id: data.accountId, user_id: data.userId }, { onConflict: 'account_id,user_id', ignoreDuplicates: true })
      : await context.supabase.from('account_members').delete().eq('account_id', data.accountId).eq('user_id', data.userId);
    if (r.error) friendly(r.error, 'Não foi possível atualizar a alocação.');
    return { ok: true };
  });

const roleSchema = z.enum(['analyst', 'kam', 'ops_manager', 'admin']);

export const inviteStaff = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ email: z.string().trim().toLowerCase().email('Informe um e-mail válido.').max(200), fullName: z.string().trim().min(3, 'Informe o nome completo.').max(120), role: roleSchema }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { getRequest } = await import('@tanstack/react-start/server');
    const origin = (process.env['APP_BASE_URL']?.trim() || new URL(getRequest().url).origin).replace(/\/+$/, '');
    const invited = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, { data: { full_name: data.fullName }, redirectTo: `${origin}/reset-password` });
    if (invited.error || !invited.data.user) throw new Error(/already been registered|already exists/i.test(invited.error?.message ?? '') ? 'Este e-mail já possui acesso cadastrado.' : 'Não foi possível enviar o convite. Tente novamente em alguns minutos.');
    const userId = invited.data.user.id;
    const profile = await supabaseAdmin.from('profiles').update({ full_name: data.fullName }).eq('id', userId);
    const role = await supabaseAdmin.from('user_roles').upsert({ user_id: userId, role: data.role }, { onConflict: 'user_id' });
    if (profile.error || role.error) throw new Error('Convite enviado, mas o perfil não foi definido. Ajuste o perfil na lista da equipe.');
    await supabaseAdmin.from('config_audit').insert({ table_name: 'user_roles', record_key: `${userId}:${data.role}`, action: 'insert', new_data: { user_id: userId, role: data.role, invited: true }, actor_id: context.userId, note: 'Convite enviado' });
    return { id: userId };
  });

export const setStaffRole = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid(), role: roleSchema }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    if (data.userId === context.userId) throw new Error('Você não pode alterar o seu próprio perfil.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    if (data.role !== 'kam') {
      const kamOf = await supabaseAdmin.from('accounts').select('name').eq('kam_id', data.userId).limit(1);
      if (kamOf.data?.length) throw new Error(`Defina outro KAM para ${kamOf.data[0]?.name} antes de mudar este perfil.`);
    }
    const r = await supabaseAdmin.from('user_roles').upsert({ user_id: data.userId, role: data.role }, { onConflict: 'user_id' });
    if (r.error) throw new Error('Não foi possível atualizar o perfil.');
    return { ok: true };
  });

export const setStaffActive = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid(), active: z.boolean() }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    if (data.userId === context.userId) throw new Error('Você não pode desativar o seu próprio acesso.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    if (!data.active) {
      const kamOf = await supabaseAdmin.from('accounts').select('name').eq('kam_id', data.userId).limit(1);
      if (kamOf.data?.length) throw new Error(`Defina outro KAM para ${kamOf.data[0]?.name} antes de desativar este acesso.`);
    }
    const r = await supabaseAdmin.from('profiles').update({ active: data.active }).eq('id', data.userId);
    if (r.error) throw new Error('Não foi possível atualizar o acesso.');
    await supabaseAdmin.from('config_audit').insert({ table_name: 'profiles', record_key: data.userId, action: 'update', new_data: { active: data.active }, actor_id: context.userId, note: data.active ? 'Acesso reativado' : 'Acesso desativado' });
    return { ok: true };
  });
