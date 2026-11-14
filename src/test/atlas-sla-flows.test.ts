// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let admin: SupabaseClient;
let kam: SupabaseClient;
let analyst: SupabaseClient;
const account='30000000-0000-4000-8000-000000000001';
const calendar='10000000-0000-4000-8000-000000000001';
const kamId='2be3a113-5b62-4a0e-9995-7b24aa44a878';
async function read(id:string) {
  const r=await admin.from('occurrences').select('*').eq('id',id).single();
  expect(r.error).toBeNull(); return r.data;
}
async function transition(id:string,action:string,body='') {
  const r=await kam.rpc('transition_occurrence',{p_occurrence_id:id,p_action:action,p_payload:{body}});
  expect(r.error).toBeNull(); return r;
}
async function fixture() {
  const contact=await kam.from('account_contacts').select('id').eq('account_id',account).limit(1).single();
  const category=await kam.from('categories').select('id').is('parent_id',null).limit(1).single();
  const r=await kam.from('occurrences').insert({account_id:account,contact_id:contact.data?.id,category_id:category.data?.id,channel:'email',type:'incident',subject:'Teste isolado SLA '+crypto.randomUUID().slice(0,8),description:'Cenário fictício de validação',customer_expectation:'Resolver o incidente fictício',impact:'high',urgency:'high',severity:'S1',created_by:kamId,protocol:'pending',first_response_due_at:new Date().toISOString(),resolution_due_at:new Date().toISOString(),resolution_started_at:new Date().toISOString()}).select('id').single();
  expect(r.error).toBeNull(); if(!r.data)throw new Error('Missing fixture'); return String(r.data.id);
}
describe('SLA lifecycle persisted rules',()=>{
  beforeAll(async()=>{
    const url=process.env['SUPABASE_URL'];const key=process.env['SUPABASE_SERVICE_ROLE_KEY'];const pub=process.env['SUPABASE_PUBLISHABLE_KEY'];
    if(!url||!key||!pub)throw new Error('Test configuration unavailable');
    admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    for(const [role,id] of [['kam',kamId],['analyst','2a529347-3e93-4a69-87a7-f3cc22868fea']] as const) {
      const email=`atlas-test-${role}@example.com`;const user=await admin.auth.admin.getUserById(id);
      if(user.data.user?.email!==email)throw new Error('Refusing to alter a real identity');
      const password=crypto.randomUUID()+crypto.randomUUID();
      const update=await admin.auth.admin.updateUserById(id,{password});expect(update.error).toBeNull();
      const client=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});
      expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();
      if(role==='kam')kam=client;else analyst=client;
    }
  },30000);
  it('requires confirmed classification, first response and containment before treatment',async()=>{
    const id=await fixture();await transition(id,'assume');
    expect((await kam.rpc('transition_occurrence',{p_occurrence_id:id,p_action:'start_treatment'})).error).not.toBeNull();
    expect((await kam.rpc('communicate_occurrence',{p_occurrence_id:id,p_kind:'internal_note',p_body:'Nota interna não é resposta'})).error).toBeNull();
    expect((await read(id)).first_response_at).toBeNull();
    await transition(id,'confirm_classification');
    expect((await kam.rpc('communicate_occurrence',{p_occurrence_id:id,p_kind:'customer_update',p_body:'Primeira atualização registrada'})).error).toBeNull();
    expect((await kam.from('actions').insert({occurrence_id:id,type:'containment',what:'Contenção de teste',owner_id:kamId,due_date:'2026-11-30'})).error).toBeNull();
    await transition(id,'start_treatment');expect((await read(id)).status).toBe('in_treatment');
    expect((await kam.rpc('transition_occurrence',{p_occurrence_id:id,p_action:'propose_solution',p_payload:{body:'Solução detalhada com vinte caracteres'}})).error).not.toBeNull();
  });
  it.each(['in_analysis','in_treatment','reopened'])('returns from pause to %s and adds only business minutes',async status=>{
    const id=await fixture();
    expect((await admin.from('occurrences').update({status,resolution_started_at:'2026-11-12T11:00:00Z'}).eq('id',id)).error).toBeNull();
    await transition(id,'ask_customer','Informe o dado pendente');
    expect((await read(id)).status).toBe('awaiting_customer');
    expect((await kam.from('v_occurrence_sla').select('sla_state').eq('id',id).single()).data?.sla_state).toBe('paused');
    const pausedSince='2026-11-13T20:30:00Z';
    expect((await admin.from('occurrences').update({paused_since:pausedSince}).eq('id',id)).error).toBeNull();
    const current=new Date().toISOString();
    const minutes=await admin.rpc('business_minutes_between',{p_calendar:calendar,p_from:pausedSince,p_to:current});
    await transition(id,'customer_replied','Dado recebido do cliente');
    const o=await read(id);expect(o.status).toBe(status);expect(o.paused_since).toBeNull();expect(o.paused_business_minutes).toBe(minutes.data);
    const expected=await admin.rpc('add_business_minutes',{p_calendar:calendar,p_start:o.resolution_started_at,p_minutes:480+Number(minutes.data)});
    expect(new Date(o.resolution_due_at).getTime()).toBe(new Date(String(expected.data)).getTime());
  });
  it('reopening preserves breaches, first response and prior cycle, resetting only resolution',async()=>{
    const id=await fixture();await transition(id,'assume');
    const responded='2026-11-13T11:30:00Z';const proposed='2026-11-13T15:00:00Z';
    expect((await admin.from('occurrences').update({status:'solution_proposed',first_response_at:responded,solution_proposed_at:proposed,first_response_breached:true,resolution_breached:true,paused_business_minutes:60}).eq('id',id)).error).toBeNull();
    const prior=await read(id);
    expect((await kam.rpc('reopen_occurrence_from_customer',{p_occurrence_id:id,p_reason:'Problema não resolvido'})).error).not.toBeNull();
    const reopen=await admin.rpc('reopen_occurrence_from_customer',{p_occurrence_id:id,p_reason:'Cliente ainda relata falha'});expect(reopen.error).toBeNull();
    const o=await read(id);expect(o).toMatchObject({status:'reopened',reopen_count:1,first_response_breached:true,resolution_breached:true,paused_business_minutes:0,solution_proposed_at:null,closed_at:null});
    expect(o.first_response_at).toBe(prior.first_response_at);expect(o.first_response_due_at).toBe(prior.first_response_due_at);
    const cycles=await admin.from('occurrence_sla_cycles').select('*').eq('occurrence_id',id).order('cycle');expect(cycles.error).toBeNull();expect(cycles.data).toHaveLength(2);expect(cycles.data?.[0].solution_proposed_at).toBe(prior.solution_proposed_at);
    const due=await admin.rpc('add_business_minutes',{p_calendar:calendar,p_start:o.resolution_started_at,p_minutes:480});expect(new Date(o.resolution_due_at).getTime()).toBe(new Date(String(due.data)).getTime());
    expect((await admin.rpc('reopen_occurrence_from_customer',{p_occurrence_id:id,p_reason:'Duplicada'})).error).not.toBeNull();
  });
  it('rejects reopening after fifteen days from closure',async()=>{
    const id=await fixture();expect((await admin.from('occurrences').update({status:'closed_resolved',closed_at:new Date(Date.now()-16*86400000).toISOString()}).eq('id',id)).error).toBeNull();
    expect((await admin.rpc('reopen_occurrence_from_customer',{p_occurrence_id:id,p_reason:'Fora do prazo'})).error).not.toBeNull();expect((await read(id)).status).toBe('closed_resolved');
  });
  it('allows only KAM/manager to revise severity with reason, recalculating from opening',async()=>{
    const id=await fixture();const o=await read(id);const args={p_occurrence_id:id,p_impact:'low',p_urgency:'low',p_category_id:o.category_id,p_reason:'Revisão justificada do impacto'};
    expect((await analyst.rpc('revise_occurrence_classification',args)).error).not.toBeNull();
    expect((await kam.rpc('revise_occurrence_classification',{...args,p_reason:''})).error).not.toBeNull();
    expect((await kam.rpc('revise_occurrence_classification',args)).error).toBeNull();
    const changed=await read(id);expect(changed.severity).toBe('S4');
    const expected=await admin.rpc('add_business_minutes',{p_calendar:calendar,p_start:o.created_at,p_minutes:6000});expect(new Date(changed.resolution_due_at).getTime()).toBe(new Date(String(expected.data)).getTime());
    const event=await kam.from('occurrence_events').select('metadata').eq('occurrence_id',id).contains('metadata',{action:'classification_revision'}).single();expect(event.error).toBeNull();expect(event.data?.metadata).toMatchObject({old_severity:'S1',new_severity:'S4'});
  });
  it('records 50/80/100 alerts once per cycle and does not mark paused resolution overdue',async()=>{
    const id=await fixture();expect((await admin.from('occurrences').update({resolution_started_at:'2026-11-02T11:00:00Z',resolution_due_at:'2026-11-02T19:00:00Z'}).eq('id',id)).error).toBeNull();
    expect((await admin.rpc('sla_tick')).error).toBeNull();expect((await admin.rpc('sla_tick')).error).toBeNull();
    const alerts=await admin.from('sla_alerts').select('alert_key').eq('occurrence_id',id);expect(alerts.error).toBeNull();expect(alerts.data?.map(a=>a.alert_key).sort()).toEqual(['res_100_c1','res_50_c1','res_80_c1']);
    const paused=await fixture();expect((await admin.from('occurrences').update({status:'awaiting_customer',paused_since:'2026-11-02T11:00:00Z',resolution_due_at:'2026-11-02T19:00:00Z'}).eq('id',paused)).error).toBeNull();
    expect((await admin.rpc('sla_tick')).error).toBeNull();expect((await read(paused)).resolution_breached).toBe(false);
  });
});