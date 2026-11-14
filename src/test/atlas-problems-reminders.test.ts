// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let admin: SupabaseClient;
let kam: SupabaseClient;
let analyst: SupabaseClient;
const account = '30000000-0000-4000-8000-000000000001';
const kamId = '2be3a113-5b62-4a0e-9995-7b24aa44a878';
const analystId = '2a529347-3e93-4a69-87a7-f3cc22868fea';
let categoryId = '';

const spDate = (offsetDays: number) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

async function occurrence(client: SupabaseClient, status?: string) {
  const contact = await admin.from('account_contacts').select('id').eq('account_id', account).eq('active', true).limit(1).single();
  const now = new Date().toISOString();
  const r = await client.from('occurrences').insert({ account_id: account, contact_id: contact.data?.id, category_id: categoryId, channel: 'email', type: 'complaint', subject: 'Teste isolado problema ' + crypto.randomUUID().slice(0, 8), description: 'Cenário fictício', customer_expectation: 'Resolver o cenário fictício', impact: 'low', urgency: 'low', severity: 'S4', created_by: kamId, protocol: 'pending', first_response_due_at: now, resolution_due_at: now, resolution_started_at: now }).select('id').single();
  expect(r.error).toBeNull();
  const id = String(r.data?.id);
  if (status) expect((await admin.from('occurrences').update({ status, first_response_at: now, solution_text: 'Solução fictícia aplicada e conferida.', solution_proposed_at: now }).eq('id', id)).error).toBeNull();
  return id;
}

async function problemInVerification() {
  const created = await kam.rpc('create_problem', { p_title: 'Problema isolado ' + crypto.randomUUID().slice(0, 6), p_account_id: account, p_category_id: categoryId });
  expect(created.error).toBeNull();
  const id = String(created.data);
  const step = async (action: string, payload: Record<string, unknown> = {}) => kam.rpc('transition_problem', { p_problem_id: id, p_action: action, p_payload: payload });
  expect((await step('assign_owner', { owner_id: kamId })).error).toBeNull();
  expect((await step('start_analysis')).error).toBeNull();
  const cause = await kam.from('causes').insert({ problem_id: id, description: 'Causa fictícia confirmada', kind: 'root', status: 'confirmed', evidence: 'Auditoria fictícia', whys: [], created_by: kamId, code: 'pending' }).select('id').single();
  expect(cause.error).toBeNull();
  expect((await step('plan_actions')).error).toBeNull();
  const action = await kam.from('actions').insert({ problem_id: id, type: 'corrective', what: 'Corrigir procedimento fictício', owner_id: kamId, due_date: spDate(30), cause_id: cause.data?.id }).select('id').single();
  expect(action.error).toBeNull();
  expect((await kam.from('actions').update({ status: 'done', done_at: new Date().toISOString(), evidence_note: 'Executada' }).eq('id', action.data?.id)).error).toBeNull();
  return { id, step };
}

describe('Problems and evaluation reminders', () => {
  beforeAll(async () => {
    const url = process.env['SUPABASE_URL']; const key = process.env['SUPABASE_SERVICE_ROLE_KEY']; const pub = process.env['SUPABASE_PUBLISHABLE_KEY'];
    if (!url || !key || !pub) throw new Error('Test configuration unavailable');
    admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const [role, id] of [['kam', kamId], ['analyst', analystId]] as const) {
      const email = `atlas-test-${role}@example.com`;
      const user = await admin.auth.admin.getUserById(id);
      if (user.data.user?.email !== email) throw new Error('Refusing to alter a real identity');
      const password = crypto.randomUUID() + crypto.randomUUID();
      expect((await admin.auth.admin.updateUserById(id, { password })).error).toBeNull();
      const client = createClient(url, pub, { auth: { persistSession: false, autoRefreshToken: false } });
      expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
      if (role === 'kam') kam = client; else analyst = client;
    }
    // One reusable, normally inactive category keeps automatic problem matching away from other tests.
    const name = 'Teste isolado · problemas';
    const existing = await admin.from('categories').select('id').eq('name', name).maybeSingle();
    const cat = existing.data ? await admin.from('categories').update({ active: true }).eq('id', existing.data.id).select('id').single() : await admin.from('categories').insert({ name, parent_id: null, active: true }).select('id').single();
    expect(cat.error).toBeNull();
    categoryId = String(cat.data?.id);
    // Problems left in verification by an interrupted run would capture this run's occurrences.
    const stale = await admin.from('problems').select('id').eq('category_id', categoryId).eq('status', 'effectiveness_check');
    for (const p of stale.data ?? []) await kam.rpc('transition_problem', { p_problem_id: p.id, p_action: 'cancel', p_payload: { body: 'Cancelado por teste automatizado interrompido' } });
  }, 30000);

  afterAll(async () => {
    if (categoryId) await admin.from('categories').update({ active: false }).eq('id', categoryId);
  });

  it('lets only KAM or operations manager open a problem', async () => {
    const refused = await analyst.rpc('create_problem', { p_title: 'Tentativa do analista', p_account_id: account, p_category_id: categoryId });
    expect(refused.error).not.toBeNull();
    const created = await kam.rpc('create_problem', { p_title: 'Aberto pelo KAM fictício', p_account_id: account, p_category_id: categoryId });
    expect(created.error).toBeNull();
    expect((await admin.from('problems').select('status').eq('id', created.data).single()).data?.status).toBe('open');
    await kam.rpc('transition_problem', { p_problem_id: created.data, p_action: 'cancel', p_payload: { body: 'Encerrado pelo teste automatizado' } });
  }, 30000);

  it('requires a measurable criterion with a number and a future verification date', async () => {
    const { id, step } = await problemInVerification();
    expect((await step('start_verification', { criteria: 'Sem reincidência', due_date: spDate(30) })).error?.message).toContain('mensurável');
    expect((await step('start_verification', { criteria: 'Zero reincidências em 60 dias', due_date: spDate(0) })).error?.message).toContain('data futura');
    expect((await step('start_verification', { criteria: 'Zero reincidências em 60 dias', due_date: spDate(30) })).error).toBeNull();
    expect((await admin.from('problems').select('status,effectiveness_criteria').eq('id', id).single()).data).toMatchObject({ status: 'effectiveness_check', effectiveness_criteria: 'Zero reincidências em 60 dias' });
    expect((await step('record_effectiveness', { effective: true, body: 'Tentativa antes da data' })).error?.message).toContain('a partir da data');
    expect((await step('record_effectiveness', { effective: false, body: 'Reincidência fictícia observada' })).error).toBeNull();
    expect((await admin.from('problems').select('status,effectiveness_effective').eq('id', id).single()).data).toMatchObject({ status: 'analysis', effectiveness_effective: false });
  }, 40000);

  it('fails effectiveness automatically when the same account and category has a new occurrence', async () => {
    const { id, step } = await problemInVerification();
    expect((await step('start_verification', { criteria: 'Zero reincidências em 60 dias', due_date: spDate(60) })).error).toBeNull();
    const occ = await occurrence(kam);
    expect((await admin.from('problems').select('status,effectiveness_effective').eq('id', id).single()).data).toMatchObject({ status: 'analysis', effectiveness_effective: false });
    expect((await admin.from('occurrences').select('problem_id').eq('id', occ).single()).data?.problem_id).toBe(id);
  }, 40000);

  it('sends reminders at 2 and 4 business days and closes without evaluation only after both and 5 business days', async () => {
    const id = await occurrence(kam, 'solution_proposed');
    const hash = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    // Eight calendar days always spans at least five business days of the weekday calendar.
    const sentAt = new Date(Date.now() - 8 * 86400000).toISOString();
    const evaluation = await admin.from('evaluations').insert({ occurrence_id: id, cycle: 1, token_hash: hash, token_expires_at: new Date(Date.now() + 86400000).toISOString(), sent_at: sentAt }).select('id').single();
    expect(evaluation.error).toBeNull();
    const state = async () => ({
      reminders: (await admin.from('evaluations').select('reminders_sent').eq('id', evaluation.data?.id).single()).data?.reminders_sent,
      status: (await admin.from('occurrences').select('status').eq('id', id).single()).data?.status,
    });
    expect((await admin.rpc('sla_tick')).error).toBeNull();
    expect(await state()).toEqual({ reminders: 1, status: 'solution_proposed' });
    expect((await admin.rpc('sla_tick')).error).toBeNull();
    expect(await state()).toEqual({ reminders: 2, status: 'solution_proposed' });
    expect((await admin.rpc('sla_tick')).error).toBeNull();
    expect(await state()).toEqual({ reminders: 2, status: 'closed_no_evaluation' });
    const reminders = await admin.from('email_dispatches').select('template').eq('occurrence_id', id).eq('template', 'evaluation-reminder');
    expect(reminders.data?.length).toBe(2);
  }, 60000);

  it('does not remind before two business days', async () => {
    const id = await occurrence(kam, 'solution_proposed');
    const hash = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    const evaluation = await admin.from('evaluations').insert({ occurrence_id: id, cycle: 1, token_hash: hash, token_expires_at: new Date(Date.now() + 86400000).toISOString(), sent_at: new Date(Date.now() - 60000).toISOString() }).select('id').single();
    expect(evaluation.error).toBeNull();
    expect((await admin.rpc('sla_tick')).error).toBeNull();
    expect((await admin.from('evaluations').select('reminders_sent').eq('id', evaluation.data?.id).single()).data?.reminders_sent).toBe(0);
  }, 30000);
});
