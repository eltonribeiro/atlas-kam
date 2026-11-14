import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { validateEvidence } from './evidence-rules';
export const getAttachments=createServerFn().middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid()})).handler(async({context,data})=>{
 const r=await context.supabase.from('attachments').select('*').eq('occurrence_id',data.id).order('created_at');
 if(r.error)throw new Error('Não foi possível carregar os anexos.');return r.data??[];
});
export const uploadEvidence=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((data:FormData)=>{if(!(data instanceof FormData))throw new Error('Arquivo inválido');return data;}).handler(async({context,data})=>{
 const id=z.string().uuid().parse(data.get('id'));const file=data.get('file');
 if(!(file instanceof File))throw new Error('Arquivo inválido');
 const filename=validateEvidence(file.name,file.size,file.type);
 const access=await context.supabase.rpc('has_occurrence_access',{p_id:id});if(access.error||!access.data)throw new Error('Sem acesso à ocorrência.');
 const count=await context.supabase.from('attachments').select('id',{count:'exact',head:true}).eq('occurrence_id',id);if(count.error||Number(count.count)>=10)throw new Error('Limite de 10 anexos por ocorrência.');
 const path=`${id}/${crypto.randomUUID()}`;
 const uploaded=await context.supabase.storage.from('evidences').upload(path,file,{contentType:file.type,upsert:false});if(uploaded.error)throw new Error('Não foi possível enviar o arquivo.');
 const saved=await context.supabase.from('attachments').insert({occurrence_id:id,storage_path:path,filename,mime_type:file.type,size_bytes:file.size,visibility:'internal',uploaded_by:context.userId});if(saved.error)throw new Error(saved.error.message);return {ok:true};
});
export const downloadEvidence=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid()})).handler(async({context,data})=>{
 const a=await context.supabase.from('attachments').select('storage_path,filename').eq('id',data.id).single();if(!a.data||a.error)throw new Error('Anexo indisponível.');
 const signed=await context.supabase.storage.from('evidences').createSignedUrl(a.data.storage_path,600,{download:a.data.filename});if(!signed.data||signed.error)throw new Error('Anexo indisponível.');
 const url=new URL(signed.data.signedUrl);url.host=new URL(import.meta.env['VITE_SUPABASE_URL']).host;return url.toString();
});