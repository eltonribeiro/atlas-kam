import { createServerFn } from '@tanstack/react-start';
import { getRequest,setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
const tokenSchema=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)});
async function digest(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');}
async function authorizedLink(token:string){
 const hash=await digest(token);const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const ip=getRequest().headers.get('cf-connecting-ip')??'unknown';
 for(const key of ['token:'+hash,'ip:'+await digest(ip)]){const r=await supabaseAdmin.rpc('limit_public_link',{p_key:key});if(r.error||!r.data)throw new Error('Tente novamente em um minuto.');}
 const e=await supabaseAdmin.from('evaluations').select('*').eq('token_hash',hash).maybeSingle();
 if(!e.data)throw new Error('Link inválido ou expirado');
 const o=await supabaseAdmin.from('occurrences').select('id,protocol,subject,customer_expectation,solution_text,created_at,solution_proposed_at,closed_at,status,reopen_count,first_response_due_at').eq('id',e.data.occurrence_id).single();
 if(!o.data||e.data.cycle!==o.data.reopen_count+1)throw new Error('Link inválido ou expirado');
 const canReopen=['closed_resolved','closed_no_evaluation'].includes(o.data.status)&&o.data.closed_at!==null&&Date.now()<=Date.parse(o.data.closed_at)+15*86400000;
 const canAnswer=!e.data.answered_at&&o.data.status==='solution_proposed'&&Date.now()<=Date.parse(e.data.token_expires_at);
 if(!canAnswer&&!canReopen)throw new Error('Link inválido ou expirado');
 return {admin:supabaseAdmin,hash,occurrence:o.data,canAnswer,canReopen};
}
export const getPublicEvaluation=createServerFn({method:'POST'}).inputValidator(tokenSchema).handler(async({data})=>{
 setResponseHeader('Cache-Control','no-store');try{const v=await authorizedLink(data.token);return {valid:true as const,occurrence:v.occurrence,canAnswer:v.canAnswer,canReopen:v.canReopen};}catch{return {valid:false as const};}
});
export const answerEvaluation=createServerFn({method:'POST'}).inputValidator(tokenSchema.extend({resolved:z.enum(['yes','partial','no']),csat:z.number().int().min(1).max(5),ces:z.number().int().min(1).max(7),missing:z.string().max(4000),comment:z.string().max(1000),reopen:z.boolean().default(false)})).handler(async({data})=>{
 const v=await authorizedLink(data.token);const r=await v.admin.rpc('answer_customer_evaluation',{p_hash:v.hash,p_resolved:data.resolved,p_csat:data.csat,p_ces:data.ces,p_missing:data.missing,p_comment:data.comment,p_reopen:data.reopen});if(r.error)throw new Error(r.error.message);return r.data;
});