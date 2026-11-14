import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';

const tokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
const INVALID = 'Link inválido ou expirado';

async function authorizedContestation(token: string) {
  const { sha256Hex, guardPublicAttempt } = await import('./public-links.server');
  const hash = await sha256Hex(token);
  const admin = await guardPublicAttempt(hash);
  const link = await admin.from('public_links').select('purpose,occurrence_id,expires_at,created_at').eq('token_hash', hash).maybeSingle();
  if (!link.data || link.data.purpose !== 'contestation' || !link.data.expires_at) throw new Error(INVALID);
  const o = await admin.from('occurrences').select('protocol,subject,unfounded_justification,closed_at,status').eq('id', link.data.occurrence_id).single();
  if (!o.data) throw new Error(INVALID);
  const existing = await admin
    .from('occurrence_contestations')
    .select('created_at,reviewed_at,decision')
    .eq('occurrence_id', link.data.occurrence_id)
    .gte('created_at', link.data.created_at)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  const expired = Date.now() > Date.parse(link.data.expires_at);
  if (expired && !existing.data) throw new Error(INVALID);
  return {
    admin,
    hash,
    occurrenceId: link.data.occurrence_id,
    expiresAt: link.data.expires_at,
    summary: { protocol: o.data.protocol, subject: o.data.subject, justification: o.data.unfounded_justification, closedAt: o.data.closed_at },
    submission: existing.data ? { createdAt: existing.data.created_at, reviewed: existing.data.reviewed_at !== null, decision: existing.data.decision } : null,
    canSubmit: !existing.data && !expired && o.data.status === 'closed_unfounded',
  };
}

export const getPublicContestation = createServerFn({ method: 'POST' })
  .inputValidator(tokenSchema)
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    try {
      const v = await authorizedContestation(data.token);
      return { valid: true as const, occurrence: v.summary, submission: v.submission, canSubmit: v.canSubmit, expiresAt: v.expiresAt };
    } catch (error) {
      const limited = error instanceof Error && error.message.startsWith('Muitas tentativas');
      return { valid: false as const, message: limited ? error.message : INVALID };
    }
  });

export const submitContestation = createServerFn({ method: 'POST' })
  .inputValidator(tokenSchema.extend({ body: z.string().trim().min(10, 'Descreva a contestação com pelo menos 10 caracteres.').max(4000) }))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const v = await authorizedContestation(data.token);
    if (!v.canSubmit) throw new Error(v.submission ? 'A contestação desta análise já foi registrada.' : INVALID);
    const r = await v.admin.rpc('submit_contestation_by_link', { p_hash: v.hash, p_body: data.body });
    if (r.error) throw new Error(r.error.message.includes('já foi registrada') ? 'A contestação desta análise já foi registrada.' : 'Não foi possível registrar a contestação. Tente novamente.');
    const { dispatchForOccurrence } = await import('./notifications.server');
    await dispatchForOccurrence(v.occurrenceId);
    return { status: 'received' as const };
  });
