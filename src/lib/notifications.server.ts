// Server-only: sends the app e-mails the database scheduled in email_dispatches.
// Recipients always come from the database (contact or internal user), never from the browser.
import { EmailAPIError } from '@lovable.dev/email-js';
import { sendTemplateEmail } from './email-templates/send-email';
import { TEMPLATES } from './email-templates/registry';
import { newPublicToken } from './public-links.server';

export type ClaimedDispatch = {
  id: string;
  template: string;
  occurrence_id: string | null;
  link_purpose: 'evaluation' | 'contestation' | null;
  data: Record<string, unknown>;
  idempotency_key: string;
  attempts: number;
  recipient_kind: 'contact' | 'user';
  email: string | null;
  name: string | null;
};

export type DispatchOutcome = { status: 'sent' | 'suppressed' | 'skipped' | 'failed'; error?: string; retryAfter?: number };

const RESERVED_DOMAIN = /(^|\.)(example\.(com|net|org)|example|test|invalid|localhost)$/i;

/** RFC 2606 domains used by fictitious test data must never be mailed: they bounce and hurt the sender reputation. */
export function isReservedTestAddress(email: string) {
  const domain = email.trim().split('@').pop()?.toLowerCase() ?? '';
  return !domain || RESERVED_DOMAIN.test(domain);
}

export function resolveAppBaseUrl(fallbackOrigin?: string) {
  const configured = process.env['APP_BASE_URL']?.trim();
  return (configured || fallbackOrigin || '').replace(/\/+$/, '');
}

type Admin = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];

export function describeSendError(error: unknown): DispatchOutcome {
  if (error instanceof EmailAPIError) {
    if (error.status === 429) return { status: 'failed', error: 'limite de envio atingido', retryAfter: error.retryAfterSeconds ?? 60 };
    if (error.code === 'domain_not_verified') return { status: 'failed', error: 'domínio de envio ainda em verificação' };
    if (error.code === 'emails_disabled') return { status: 'failed', error: 'envio de e-mails desativado no projeto' };
    return { status: 'failed', error: `serviço de e-mail recusou o envio (${error.code ?? error.status})` };
  }
  return { status: 'failed', error: 'falha temporária no serviço de e-mail' };
}

export async function deliverDispatch(row: ClaimedDispatch, baseUrl: string, admin: Pick<Admin, 'rpc'>): Promise<DispatchOutcome> {
  if (!TEMPLATES[row.template]) return { status: 'skipped', error: 'modelo de e-mail indisponível' };
  if (!row.email) return { status: 'skipped', error: 'destinatário inativo ou sem e-mail cadastrado' };
  if (isReservedTestAddress(row.email)) return { status: 'skipped', error: 'endereço fictício reservado para testes' };
  if (!baseUrl) return { status: 'failed', error: 'endereço do aplicativo não configurado' };
  const templateData: Record<string, unknown> = { ...row.data };
  if (typeof row.data['path'] === 'string') templateData['appUrl'] = baseUrl + row.data['path'];
  if (row.link_purpose) {
    const { token, hash } = await newPublicToken();
    const issued = await admin.rpc('issue_public_link', { p_dispatch_id: row.id, p_hash: hash });
    if (issued.error) return { status: 'failed', error: 'não foi possível gerar o link do cliente' };
    const result = issued.data as { ok?: boolean; reason?: string } | null;
    if (!result?.ok) return { status: 'skipped', error: result?.reason ?? 'link não se aplica mais' };
    templateData['url'] = `${baseUrl}/${row.link_purpose === 'evaluation' ? 'avaliacao' : 'contestacao'}/${token}`;
  }
  try {
    const sent = await sendTemplateEmail(row.template, row.email, { templateData, idempotencyKey: row.idempotency_key });
    return sent.sent ? { status: 'sent' } : { status: 'suppressed' };
  } catch (error) {
    console.error('Atlas e-mail dispatch failed', row.template, row.id, error);
    return describeSendError(error);
  }
}

export async function processDispatches(options: { occurrenceId?: string | undefined; limit?: number | undefined; origin?: string | undefined } = {}) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const claimed = await supabaseAdmin.rpc('claim_email_dispatches', { ...(options.occurrenceId ? { p_occurrence_id: options.occurrenceId } : {}), p_limit: options.limit ?? 25 });
  if (claimed.error) throw new Error('Não foi possível ler os envios pendentes.');
  const rows = (Array.isArray(claimed.data) ? claimed.data : []) as unknown as ClaimedDispatch[];
  const baseUrl = resolveAppBaseUrl(options.origin);
  const totals = { sent: 0, suppressed: 0, skipped: 0, failed: 0 };
  for (const row of rows) {
    let outcome: DispatchOutcome;
    try {
      outcome = await deliverDispatch(row, baseUrl, supabaseAdmin);
    } catch (error) {
      console.error('Atlas e-mail dispatch crashed', row.id, error);
      outcome = { status: 'failed', error: 'falha inesperada no envio' };
    }
    totals[outcome.status] += 1;
    const done = await supabaseAdmin.rpc('complete_email_dispatch', { p_id: row.id, p_outcome: outcome.status, ...(outcome.error ? { p_error: outcome.error } : {}), ...(outcome.retryAfter ? { p_retry_after: outcome.retryAfter } : {}) });
    if (done.error) console.error('Atlas e-mail dispatch result not saved', row.id, done.error.message);
  }
  return totals;
}

/** Sends what a user action just scheduled; failures stay pending for the scheduled retry. */
export async function dispatchForOccurrence(occurrenceId: string) {
  try {
    const { getRequest } = await import('@tanstack/react-start/server');
    await processDispatches({ occurrenceId, limit: 10, origin: new URL(getRequest().url).origin });
  } catch (error) {
    console.error('Atlas immediate dispatch deferred to scheduled retry', occurrenceId, error);
  }
}
