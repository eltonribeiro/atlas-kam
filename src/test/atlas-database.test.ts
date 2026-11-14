// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
let admin: SupabaseClient;
describe('Atlas persisted business rules',()=>{
 beforeAll(()=>{const url=process.env['SUPABASE_URL']; const key=process.env['SUPABASE_SERVICE_ROLE_KEY'];if(!url||!key)throw new Error('Database test configuration unavailable');admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});});
 it.each([['accounts',4],['account_contacts',8],['categories',7]] as const)('stores %s seed count %i',async(table,count)=>{const r=await admin.from(table).select('id',{count:'exact',head:true});expect(r.error).toBeNull();expect(r.count).toBe(count);});
 it('stores S1 goals of 60 response, 480 solution and 120 update minutes',async()=>{const r=await admin.from('sla_targets').select('*').eq('severity','S1').single();expect(r.error).toBeNull();expect(r.data).toMatchObject({first_response_minutes:60,resolution_minutes:480,update_interval_minutes:120});});
 it('stores weekday 08:00–18:00 Sao Paulo calendar',async()=>{const r=await admin.from('business_calendars').select('*').single();expect(r.error).toBeNull();expect(r.data).toMatchObject({timezone:'America/Sao_Paulo',work_start:'08:00:00',work_end:'18:00:00',work_days:[1,2,3,4,5]});});
 it('has ten 2026 national holidays without carnival',async()=>{const r=await admin.from('holidays').select('day');expect(r.error).toBeNull();expect(r.data).toHaveLength(10);expect(r.data?.some(d=>d.day==='2026-11-20')).toBe(true);expect(r.data?.some(d=>d.day==='2026-02-17')).toBe(false);});
 it.each([['high','high','S1'],['high','medium','S2'],['high','low','S3'],['medium','high','S2'],['medium','medium','S3'],['medium','low','S4'],['low','high','S3'],['low','medium','S4'],['low','low','S4']])('maps %s impact and %s urgency to %s',async(impact,urgency,severity)=>{const r=await admin.rpc('calculate_severity',{p_impact:impact,p_urgency:urgency});expect(r.error).toBeNull();expect(r.data).toBe(severity);});
it('Friday 17:30 plus 60 business minutes is Monday 08:30',async()=>{const r=await admin.rpc('add_business_minutes',{p_calendar:'10000000-0000-4000-8000-000000000001',p_start:'2026-11-13T20:30:00Z',p_minutes:60});expect(r.error).toBeNull();expect(new Date(String(r.data)).toISOString()).toBe('2026-11-16T11:30:00.000Z');});
 it('skips national holiday November 20',async()=>{const r=await admin.rpc('add_business_minutes',{p_calendar:'10000000-0000-4000-8000-000000000001',p_start:'2026-11-19T20:30:00Z',p_minutes:60});expect(r.error).toBeNull();expect(new Date(String(r.data)).toISOString()).toBe('2026-11-23T11:30:00.000Z');});
});
