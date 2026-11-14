import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { MAX_EVIDENCE_COUNT, validateEvidence } from './evidence-rules';

export const getAttachments = createServerFn()
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.from('attachments').select('*').eq('occurrence_id', data.id).order('created_at');
    if (r.error) throw new Error('Não foi possível carregar os anexos.');
    const uploaderIds = [...new Set((r.data ?? []).map((a) => a.uploaded_by).filter((v): v is string => Boolean(v)))];
    const people = uploaderIds.length ? await context.supabase.from('profiles').select('id,full_name').in('id', uploaderIds) : { data: [] };
    const names = Object.fromEntries((people.data ?? []).map((p) => [p.id, p.full_name]));
    return (r.data ?? []).map((a) => ({ ...a, uploader_name: a.uploaded_by ? (names[a.uploaded_by] ?? null) : null }));
  });

export const uploadEvidence = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: FormData) => {
    if (!(data instanceof FormData)) throw new Error('Arquivo inválido.');
    return data;
  })
  .handler(async ({ context, data }) => {
    const id = z.string().uuid().parse(data.get('id'));
    const actionRaw = data.get('actionId');
    const actionId = actionRaw ? z.string().uuid().parse(actionRaw) : null;
    const visibility = z.enum(['internal', 'customer']).catch('internal').parse(data.get('visibility') ?? 'internal');
    const file = data.get('file');
    if (!(file instanceof File)) throw new Error('Arquivo inválido.');
    const filename = validateEvidence(file.name, file.size, file.type);
    const access = await context.supabase.rpc('has_occurrence_access', { p_id: id });
    if (access.error || !access.data) throw new Error('Sem acesso à ocorrência.');
    if (actionId) {
      const action = await context.supabase.from('actions').select('id').eq('id', actionId).eq('occurrence_id', id).maybeSingle();
      if (action.error || !action.data) throw new Error('A ação informada não pertence a esta ocorrência.');
    }
    const count = await context.supabase.from('attachments').select('id', { count: 'exact', head: true }).eq('occurrence_id', id);
    if (count.error || Number(count.count) >= MAX_EVIDENCE_COUNT) throw new Error(`Limite de ${MAX_EVIDENCE_COUNT} anexos por ocorrência.`);
    const path = `${id}/${crypto.randomUUID()}`;
    const uploaded = await context.supabase.storage.from('evidences').upload(path, file, { contentType: file.type, upsert: false });
    if (uploaded.error) throw new Error('Não foi possível enviar o arquivo.');
    const saved = await context.supabase.from('attachments').insert({ occurrence_id: id, action_id: actionId, storage_path: path, filename, mime_type: file.type, size_bytes: file.size, visibility, uploaded_by: context.userId });
    if (saved.error) {
      await context.supabase.storage.from('evidences').remove([path]);
      throw new Error(/limit|limite/i.test(saved.error.message) ? `Limite de ${MAX_EVIDENCE_COUNT} anexos por ocorrência.` : 'Não foi possível registrar o anexo.');
    }
    return { ok: true };
  });

export const downloadEvidence = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const a = await context.supabase.from('attachments').select('storage_path,filename').eq('id', data.id).single();
    if (!a.data || a.error) throw new Error('Anexo indisponível.');
    const signed = await context.supabase.storage.from('evidences').createSignedUrl(a.data.storage_path, 600, { download: a.data.filename });
    if (!signed.data || signed.error) throw new Error('Anexo indisponível.');
    const url = new URL(signed.data.signedUrl);
    url.host = new URL(import.meta.env['VITE_SUPABASE_URL']).host;
    return url.toString();
  });
