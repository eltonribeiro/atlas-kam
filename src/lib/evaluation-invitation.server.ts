import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { sendTemplateEmail } from './email-templates/send-email';
export async function inviteCustomerEvaluation(id:string,origin:string){
 const o=await supabaseAdmin.from('occurrences').select('id,protocol,status,solution_text,reopen_count,contact_id').eq('id',id).single();if(!o.data||o.data.status!=='solution_proposed')return {sent:false};
 const c=await supabaseAdmin.from('account_contacts').select('email').eq('id',o.data.contact_id).eq('active',true).single();if(!c.data)return {sent:false};
 const bytes=crypto.getRandomValues(new Uint8Array(32));const token=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),v=>v.toString(16).padStart(2,'0')).join('');
 const cycle=o.data.reopen_count+1;const evaluation=await supabaseAdmin.from('evaluations').insert({occurrence_id:id,cycle,token_hash:hash,token_expires_at:new Date(Date.now()+15*86400000).toISOString()}).select('id').single();
 if(evaluation.error)return {sent:false};
 try{return await sendTemplateEmail('solution-evaluation',c.data.email,{templateData:{protocol:o.data.protocol,solution:o.data.solution_text,url:`${origin}/avaliacao/${token}`},idempotencyKey:`evaluation-${evaluation.data.id}`});}catch{return {sent:false};}
}