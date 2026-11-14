import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';

const tokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
const INVALID = 'Link inválido ou expirado';

async function authorizedEvaluation(token: string) {
  const { sha256Hex, guardPublicAttempt } = await import('./public-links.server');
  const hash = await sha256Hex(token);
  const admin = await guardPublicAttempt(hash);
  const link = await admin.from('public_links').select('purpose,evaluation_id').eq('token_hash', hash).maybeSingle();
  if (!link.data || link.data.purpose !== 'evaluation' || !link.data.evaluation_id) throw new Error(INVALID);
  const e = await admin.from('evaluations').select('id,cycle,answered_at,token_expires_at,occurrence_id').eq('id', link.data.evaluation_id).single();
  if (!e.data) throw new Error(INVALID);
  const o = await admin
    .from('occurrences')
    .select('id,protocol,subject,customer_expectation,solution_text,created_at,solution_proposed_at,closed_at,status,reopen_count')
    .eq('id', e.data.occurrence_id)
    .single();
  if (!o.data || e.data.cycle !== o.data.reopen_count + 1) throw new Error(INVALID);
  const canReopen = ['closed_resolved', 'closed_no_evaluation'].includes(o.data.status) && o.data.closed_at !== null && Date.now() <= Date.parse(o.data.closed_at) + 15 * 86400000;
  const canAnswer = !e.data.answered_at && o.data.status === 'solution_proposed' && Date.now() <= Date.parse(e.data.token_expires_at);
  if (!canAnswer && !canReopen) throw new Error(INVALID);
  const summary = {
    protocol: o.data.protocol,
    subject: o.data.subject,
    customer_expectation: o.data.customer_expectation,
    solution_text: o.data.solution_text,
    created_at: o.data.created_at,
    solution_proposed_at: o.data.solution_proposed_at,
    closed_at: o.data.closed_at,
  };
  return { admin, hash, occurrenceId: o.data.id, summary, canAnswer, canReopen, reopenUntil: canReopen && o.data.closed_at ? new Date(Date.parse(o.data.closed_at) + 15 * 86400000).toISOString() : null };
}

export const getPublicEvaluation = createServerFn({ method: 'POST' })
  .inputValidator(tokenSchema)
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    try {
      const v = await authorizedEvaluation(data.token);
      return { valid: true as const, occurrence: v.summary, canAnswer: v.canAnswer, canReopen: v.canReopen, reopenUntil: v.reopenUntil };
    } catch (error) {
      const limited = error instanceof Error && error.message.startsWith('Muitas tentativas');
      return { valid: false as const, message: limited ? error.message : INVALID };
    }
  });

export const answerEvaluation = createServerFn({ method: 'POST' })
  .inputValidator(
    tokenSchema.extend({
      resolved: z.enum(['yes', 'partial', 'no']),
      csat: z.number().int().min(1).max(5),
      ces: z.number().int().min(1).max(7),
      missing: z.string().max(4000),
      comment: z.string().max(1000),
      reopen: z.boolean().default(false),
    }),
  )
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const v = await authorizedEvaluation(data.token);
    if (data.reopen ? !v.canReopen : !v.canAnswer) throw new Error(INVALID);
    if ((data.reopen || data.resolved !== 'yes') && data.missing.trim().length === 0) throw new Error('Descreva o que ainda falta resolver.');
    const r = await v.admin.rpc('answer_customer_evaluation', {
      p_hash: v.hash,
      p_resolved: data.resolved,
      p_csat: data.csat,
      p_ces: data.ces,
      p_missing: data.missing.trim(),
      p_comment: data.comment.trim(),
      p_reopen: data.reopen,
    });
    if (r.error) throw new Error(r.error.message === 'Resposta incompleta' ? 'Responda todas as perguntas obrigatórias.' : INVALID);
    const after = await v.admin.from('occurrences').select('status,resolution_due_at').eq('id', v.occurrenceId).single();
    const { dispatchForOccurrence } = await import('./notifications.server');
    await dispatchForOccurrence(v.occurrenceId);
    return { status: after.data?.status ?? 'closed_resolved', resolutionDueAt: after.data?.status === 'reopened' ? after.data.resolution_due_at : null };
  });
