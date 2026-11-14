// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
let admin: SupabaseClient;
describe('Atlas persisted business rules',()=>{
 beforeAll(()=>{const url=process.env['SUPABASE_URL']; const key=process.env['SUPABASE_SERVICE_ROLE_KEY'];if(!url||!key)throw new Error('Database test configuration unavailable');admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});});
 const seedIds=(prefix:string,from:number,to:number)=>Array.from({length:to-from+1},(_,i)=>`${prefix}-0000-4000-8000-${String(from+i).padStart(12,'0')}`);
 const seeds={accounts:seedIds('30000000',1,4),account_contacts:seedIds('40000000',3,10),categories:seedIds('50000000',1,7)};
 it.each([['accounts',4],['account_contacts',8],['categories',7]] as const)('stores %s seed count %i',async(table,count)=>{const r=await admin.from(table).select('id',{count:'exact',head:true}).in('id',seeds[table]).eq('active',true);expect(r.error).toBeNull();expect(r.count).toBe(count);});
 it('stores S1 goals of 60 response, 480 solution and 120 update minutes',async()=>{const r=await admin.from('sla_targets').select('*').eq('severity','S1').single();expect(r.error).toBeNull();expect(r.data).toMatchObject({first_response_minutes:60,resolution_minutes:480,update_interval_minutes:120});});
 it('stores weekday 08:00–18:00 Sao Paulo calendar',async()=>{const r=await admin.from('business_calendars').select('*').single();expect(r.error).toBeNull();expect(r.data).toMatchObject({timezone:'America/Sao_Paulo',work_start:'08:00:00',work_end:'18:00:00',work_days:[1,2,3,4,5]});});
 it('has ten 2026 national holidays without carnival',async()=>{const r=await admin.from('holidays').select('day');expect(r.error).toBeNull();expect(r.data).toHaveLength(10);expect(r.data?.some(d=>d.day==='2026-11-20')).toBe(true);expect(r.data?.some(d=>d.day==='2026-02-17')).toBe(false);});
 it.each([['high','high','S1'],['high','medium','S2'],['high','low','S3'],['medium','high','S2'],['medium','medium','S3'],['medium','low','S4'],['low','high','S3'],['low','medium','S4'],['low','low','S4']])('maps %s impact and %s urgency to %s',async(impact,urgency,severity)=>{const r=await admin.rpc('calculate_severity',{p_impact:impact,p_urgency:urgency});expect(r.error).toBeNull();expect(r.data).toBe(severity);});
it('Friday 17:30 plus 60 business minutes is Monday 08:30',async()=>{const r=await admin.rpc('add_business_minutes',{p_calendar:'10000000-0000-4000-8000-000000000001',p_start:'2026-11-13T20:30:00Z',p_minutes:60});expect(r.error).toBeNull();expect(new Date(String(r.data)).toISOString()).toBe('2026-11-16T11:30:00.000Z');});
 it('skips national holiday November 20',async()=>{const r=await admin.rpc('add_business_minutes',{p_calendar:'10000000-0000-4000-8000-000000000001',p_start:'2026-11-19T20:30:00Z',p_minutes:60});expect(r.error).toBeNull();expect(new Date(String(r.data)).toISOString()).toBe('2026-11-23T11:30:00.000Z');});
 it('internal identities are isolated by account and cannot elevate their roles',async()=>{
  const url=process.env['SUPABASE_URL'];const pub=process.env['SUPABASE_PUBLISHABLE_KEY'];if(!url||!pub)throw new Error('Test connection unavailable');
  const expectedIds:Record<string,string>={analyst:'2a529347-3e93-4a69-87a7-f3cc22868fea',kam:'2be3a113-5b62-4a0e-9995-7b24aa44a878',ops_manager:'edb3485a-9319-42da-bc6b-ca5704a16d73',admin:'dbf0a7a4-c48e-46e7-80ef-9b1be10e3627'};
  for(const [role,id] of Object.entries(expectedIds)){
   const email=`atlas-test-${role}@example.com`;const identity=await admin.auth.admin.getUserById(id);expect(identity.data.user?.email).toBe(email);
   if(identity.data.user?.email!==email)throw new Error('Refusing to change non-test identity');
   const password=crypto.randomUUID()+crypto.randomUUID();const update=await admin.auth.admin.updateUserById(id,{password});expect(update.error).toBeNull();
   const client=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});const login=await client.auth.signInWithPassword({email,password});expect(login.error).toBeNull();
   const accounts=await client.from('accounts').select('id');expect(accounts.error).toBeNull();if(['analyst','kam'].includes(role))expect(accounts.data).toHaveLength(1);else expect(seeds.accounts.every(seed=>accounts.data?.some(a=>a.id===seed))).toBe(true);
   const attempt=await client.from('user_roles').update({role:'admin'}).eq('user_id',id).select('role');expect(attempt.data??[]).toHaveLength(0);
   const actual=await admin.from('user_roles').select('role').eq('user_id',id).single();expect(actual.data?.role).toBe(role);
   const evaluation=await client.from('evaluations').insert({occurrence_id:'2803c8cf-8e44-4a5f-8524-2eabe115750a',token_hash:'a'.repeat(64),token_expires_at:'2026-11-30T00:00:00Z'}).select('id');expect(evaluation.data??[]).toHaveLength(0);
   await client.auth.signOut();
  }
 },30000);
 it('history is immutable even for privileged service operations',async()=>{
  const event=await admin.from('occurrence_events').select('id,body').limit(1).single();expect(event.error).toBeNull();if(!event.data)throw new Error('Missing workflow fixture');
  const change=await admin.from('occurrence_events').update({body:'Forbidden mutation'}).eq('id',event.data.id);expect(change.error).not.toBeNull();
  const remove=await admin.from('occurrence_events').delete().eq('id',event.data.id);expect(remove.error).not.toBeNull();
  const reread=await admin.from('occurrence_events').select('body').eq('id',event.data.id).single();expect(reread.data?.body).toBe(event.data.body);
 });
 it.each(['corrective','preventive'])('rejects %s action without a cause',async type=>{
  const r=await admin.from('actions').insert({occurrence_id:'2803c8cf-8e44-4a5f-8524-2eabe115750a',type,what:'Invalid test action',owner_id:'2be3a113-5b62-4a0e-9995-7b24aa44a878',due_date:'2026-11-30'});expect(r.error?.code).toBe('23514');
 });
 it('rejects another account contact on an occurrence',async()=>{
  const r=await admin.from('occurrences').update({contact_id:'40000000-0000-4000-8000-000000000005'}).eq('id','2803c8cf-8e44-4a5f-8524-2eabe115750a');expect(r.error?.code).toBe('23503');
 });
});
