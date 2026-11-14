// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildKpis } from '@/components/atlas/kpi-grid';
import type { KpiWindow } from '@/lib/dashboard.functions';

// Historical window (Mon 2021-03-01 → Sun 2021-03-07, São Paulo) on an isolated account,
// so current dashboards are never affected and other tests cannot leak in.
let admin: SupabaseClient;
let accountId = '';
const at = (local: string) => new Date(`${local}-03:00`).toISOString();

async function occurrence(contactId: string, categoryId: string, createdAt: string, firstResponseAt: string | null, breached: boolean) {
  const r = await admin.from('occurrences').insert({ account_id: accountId, contact_id: contactId, category_id: categoryId, channel: 'email', type: 'complaint', subject: 'Teste isolado KPI ' + crypto.randomUUID().slice(0, 6), description: 'Cenário fictício', customer_expectation: 'Resolver o cenário fictício', impact: 'low', urgency: 'low', severity: 'S4', created_by: '2be3a113-5b62-4a0e-9995-7b24aa44a878', protocol: 'pending', first_response_due_at: createdAt, resolution_due_at: createdAt, resolution_started_at: createdAt }).select('id').single();
  expect(r.error).toBeNull();
  const id = String(r.data?.id);
  const u = await admin.from('occurrences').update({ created_at: createdAt, first_response_at: firstResponseAt, first_response_breached: breached }).eq('id', id);
  expect(u.error).toBeNull();
  return id;
}

async function evaluation(occurrenceId: string, sentAt: string, answer?: { at: string; resolved: 'yes' | 'partial' | 'no'; csat: number; ces: number }) {
  const hash = (crypto.randomUUID() + crypto.randomUUID()).replaceAll('-', '');
  const r = await admin.from('evaluations').insert({ occurrence_id: occurrenceId, cycle: 1, token_hash: hash, token_expires_at: at('2021-03-20T00:00:00'), sent_at: sentAt, ...(answer ? { answered_at: answer.at, resolved: answer.resolved, csat: answer.csat, ces: answer.ces, missing_text: answer.resolved === 'yes' ? null : 'Pendência fictícia' } : {}) });
  expect(r.error).toBeNull();
}

async function statusEvent(occurrenceId: string, from: string, to: string, createdAt: string) {
  const r = await admin.from('occurrence_events').insert({ occurrence_id: occurrenceId, kind: 'status_change', visibility: 'system', from_status: from, to_status: to, body: 'Marco fictício de teste', created_at: createdAt });
  expect(r.error).toBeNull();
}

describe('Dashboard KPIs', () => {
  beforeAll(async () => {
    const url = process.env['SUPABASE_URL']; const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!url || !key) throw new Error('Test configuration unavailable');
    admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const base = await admin.from('accounts').select('calendar_id,sla_policy_id').eq('id', '30000000-0000-4000-8000-000000000001').single();
    const acc = await admin.from('accounts').insert({ name: 'Teste isolado KPI ' + crypto.randomUUID().slice(0, 6), calendar_id: base.data?.calendar_id, sla_policy_id: base.data?.sla_policy_id, active: true }).select('id').single();
    expect(acc.error).toBeNull();
    accountId = String(acc.data?.id);
    const contact = await admin.from('account_contacts').insert({ account_id: accountId, name: 'Contato KPI fictício', email: 'kpi@example.test', job_title: 'Teste' }).select('id').single();
    expect(contact.error).toBeNull();
    const category = await admin.from('categories').select('id').is('parent_id', null).eq('active', true).limit(1).single();
    const contactId = String(contact.data?.id); const categoryId = String(category.data?.id);

    // 1st response: 60 business minutes on time and 240 minutes breached.
    const a = await occurrence(contactId, categoryId, at('2021-03-01T09:00:00'), at('2021-03-01T10:00:00'), false);
    const b = await occurrence(contactId, categoryId, at('2021-03-01T09:00:00'), at('2021-03-01T13:00:00'), true);
    const c = await occurrence(contactId, categoryId, at('2021-03-01T09:00:00'), null, false);
    const d = await occurrence(contactId, categoryId, at('2021-03-01T09:00:00'), null, false);
    // Solutions: A after 600 business minutes (1 day) on time; B after 1200 minutes with 120 paused, breached.
    expect((await admin.from('occurrence_sla_cycles').update({ solution_proposed_at: at('2021-03-02T09:00:00'), paused_business_minutes: 0, resolution_breached: false }).eq('occurrence_id', a).eq('cycle', 1)).error).toBeNull();
    expect((await admin.from('occurrence_sla_cycles').update({ solution_proposed_at: at('2021-03-03T09:00:00'), paused_business_minutes: 120, resolution_breached: true }).eq('occurrence_id', b).eq('cycle', 1)).error).toBeNull();
    // Surveys: four sent, two answered (one "Sim" 5/2, one "Não" 2/6).
    await evaluation(a, at('2021-03-02T10:00:00'), { at: at('2021-03-03T10:00:00'), resolved: 'yes', csat: 5, ces: 2 });
    await evaluation(b, at('2021-03-03T10:00:00'), { at: at('2021-03-04T10:00:00'), resolved: 'no', csat: 2, ces: 6 });
    await evaluation(c, at('2021-03-03T10:00:00'));
    await evaluation(d, at('2021-03-03T10:00:00'));
    // Closures: A closed then reopened within 15 days; B closed without reopening.
    await statusEvent(a, 'solution_proposed', 'closed_resolved', at('2021-03-04T10:00:00'));
    await statusEvent(a, 'closed_resolved', 'reopened', at('2021-03-05T10:00:00'));
    await statusEvent(b, 'solution_proposed', 'closed_resolved', at('2021-03-04T11:00:00'));
  }, 60000);

  afterAll(async () => {
    if (accountId) await admin.from('accounts').update({ active: false }).eq('id', accountId);
  });

  it('matches the eight indicators calculated by hand for the period', async () => {
    const r = await admin.rpc('dashboard_kpis', { p_from: '2021-03-01', p_to: '2021-03-07', p_account_id: accountId });
    expect(r.error).toBeNull();
    expect(r.data.current).toMatchObject({
      first_response_sla: 50, first_response_n: 2, first_response_avg_minutes: 150,
      solution_sla: 50, solution_n: 2, solution_avg_minutes: 840, solution_avg_days: 1.4,
      resolution_index: 50, resolution_index_n: 2, csat: 3.5, ces: 4,
      response_rate: 50, surveys_sent: 4, surveys_answered: 2,
      reopen_rate: 50, closures_n: 2, reopened_n: 1,
    });
  });

  it('returns empty indicators for a period without data, including the previous period', async () => {
    const r = await admin.rpc('dashboard_kpis', { p_from: '2021-03-01', p_to: '2021-03-07', p_account_id: accountId });
    expect(r.data.previous).toMatchObject({ first_response_sla: null, solution_sla: null, resolution_index: null, csat: null, response_rate: null, reopen_rate: null, first_response_n: 0, surveys_sent: 0 });
  });

  it('rejects an inverted or longer than two-year period', async () => {
    expect((await admin.rpc('dashboard_kpis', { p_from: '2021-03-07', p_to: '2021-03-01', p_account_id: accountId })).error).not.toBeNull();
    expect((await admin.rpc('dashboard_kpis', { p_from: '2019-01-01', p_to: '2021-03-01', p_account_id: accountId })).error).not.toBeNull();
  });
});

const empty: KpiWindow = { resolution_index: null, resolution_index_n: 0, first_response_sla: null, first_response_n: 0, solution_sla: null, solution_n: 0, first_response_avg_minutes: null, solution_avg_minutes: null, solution_avg_days: null, csat: null, ces: null, evaluations_answered: 0, response_rate: null, surveys_sent: 0, surveys_answered: 0, reopen_rate: null, closures_n: 0, reopened_n: 0 };

describe('KPI presentation rules', () => {
  it('warns about CSAT reliability when the survey response rate is below 30%', () => {
    const below = buildKpis({ ...empty, response_rate: 29.9, csat: 4.5 }, empty);
    expect(below.find((k) => k.key === 'csat')?.warning).toBeTruthy();
    expect(below.find((k) => k.key === 'response')?.warning).toBeTruthy();
    const at30 = buildKpis({ ...empty, response_rate: 30, csat: 4.5 }, empty);
    expect(at30.find((k) => k.key === 'csat')?.warning).toBeUndefined();
  });

  it('treats a lower reopening rate and a faster response as improvements', () => {
    const kpis = buildKpis({ ...empty, reopen_rate: 10, first_response_avg_minutes: 60, first_response_sla: 80 }, { ...empty, reopen_rate: 20, first_response_avg_minutes: 120, first_response_sla: 90 });
    expect(kpis.find((k) => k.key === 'reopen')?.delta?.better).toBe(true);
    expect(kpis.find((k) => k.key === 'fr_time')?.delta?.better).toBe(true);
    expect(kpis.find((k) => k.key === 'fr_sla')?.delta?.better).toBe(false);
  });
});
