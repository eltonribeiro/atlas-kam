import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export const statusLabels: Record<string, string> = {
  registered: 'Registrada',
  in_analysis: 'Em análise',
  in_treatment: 'Em tratativa',
  awaiting_customer: 'Aguardando cliente',
  solution_proposed: 'Solução proposta · aguardando avaliação',
  reopened: 'Reaberta',
  closed_resolved: 'Encerrada · resolvida',
  closed_no_evaluation: 'Encerrada · sem avaliação',
  closed_unfounded: 'Encerrada · improcedente',
};
export const actionLabels: Record<string, string> = { containment: 'Contenção', correction: 'Correção', corrective: 'Corretiva', preventive: 'Preventiva' };
export const typeLabels: Record<string, string> = { complaint: 'Reclamação', incident: 'Incidente operacional', request: 'Solicitação' };
export const channelLabels: Record<string, string> = { portal: 'Portal', email: 'E-mail', phone: 'Telefone', whatsapp: 'WhatsApp', account_meeting: 'Reunião de conta', site_visit: 'Visita ao site' };
export const levelLabels: Record<string, string> = { high: 'Alto', medium: 'Médio', low: 'Baixo' };
export const urgencyLabels: Record<string, string> = { high: 'Alta', medium: 'Média', low: 'Baixa' };
export const severityNames: Record<string, string> = { S1: 'Crítica', S2: 'Alta', S3: 'Média', S4: 'Baixa' };
export const causeStatusLabels: Record<string, string> = { hypothesis: 'Hipótese', validating: 'Em validação', confirmed: 'Confirmada', discarded: 'Descartada' };
export const sixMLabels: Record<string, string> = { method: 'Método', machine: 'Máquina', manpower: 'Mão de obra', material: 'Material', measurement: 'Medição', environment: 'Meio ambiente' };
export const roleLabels: Record<string, string> = { analyst: 'Analista', kam: 'KAM', ops_manager: 'Gestor de operações', admin: 'Administrador' };
export const problemStatusLabels: Record<string, string> = { open: 'Aberto', analysis: 'Em análise', action_plan: 'Plano de ação', effectiveness_check: 'Verificação de eficácia', closed: 'Encerrado', cancelled: 'Cancelado' };
export const CLOSED = ['closed_resolved', 'closed_no_evaluation', 'closed_unfounded'];

const tz = 'America/Sao_Paulo';
export function formatDateTime(value?: string | null) {
  return value ? new Intl.DateTimeFormat('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
}
export function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, dateStyle: 'short' }).format(date);
}
export function formatShortDateTime(value?: string | null) {
  return value ? new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
}
/** Business minutes as h:mm. */
export function formatMinutes(minutes?: number | null) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '—';
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}
export function formatTarget(minutes?: number | null) {
  if (!minutes) return '—';
  if (minutes % 600 === 0 && minutes >= 600) return `${minutes / 600} ${minutes === 600 ? 'dia útil' : 'dias úteis'}`;
  if (minutes % 60 === 0) return `${minutes / 60} h úteis`;
  return `${minutes} min úteis`;
}
export function formatElapsed(fromIso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - Date.parse(fromIso)) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}
export function todayInSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function DateTime({ value }: { value?: string | null | undefined }) {
  return <span className="font-mono">{formatDateTime(value)}</span>;
}
export function StateBadge({ status }: { status: string }) {
  const tone = status === 'reopened' ? 'state-breach' : status === 'awaiting_customer' || CLOSED.includes(status) ? 'state-pause' : status === 'solution_proposed' ? 'state-ok' : 'state-neutral';
  return <span className={`state-badge ${tone}`}>{statusLabels[status] ?? status}</span>;
}
export function SeverityBadge({ severity, withName = false }: { severity: string; withName?: boolean }) {
  return <span className={`severity-badge sev-${severity}`}>{severity}{withName ? ` · ${severityNames[severity] ?? ''}` : ''}</span>;
}

/** Resolution clock badge: state is always written, never color only. */
export function SlaBadge({ state, due, pausedSince }: { state?: string | null | undefined; due?: string | null | undefined; pausedSince?: string | null | undefined }) {
  if (state === 'paused') return <span className="state-badge state-pause">Pausado{pausedSince ? ` há ${formatElapsed(pausedSince)}` : ''}</span>;
  if (state === 'stopped') return <span className="state-badge state-pause">Parado</span>;
  if (state === 'breached') return <span className="state-badge state-breach">Violado{due ? ` há ${formatElapsed(due)}` : ''}</span>;
  if (state === 'risk') return <span className="state-badge state-risk">Em risco · vence {formatShortDateTime(due)}</span>;
  return <span className="state-badge state-ok">No prazo · vence {formatShortDateTime(due)}</span>;
}
export function FirstResponseBadge({ at, due, breached, minutes, closed }: { at?: string | null | undefined; due?: string | null | undefined; breached?: boolean | null | undefined; minutes?: number | null | undefined; closed?: boolean | undefined }) {
  if (at) return <span className={`state-badge ${breached ? 'state-breach' : 'state-ok'}`}>{breached ? 'Fora do prazo' : 'No prazo'}{minutes === null || minutes === undefined ? '' : ` · ${formatMinutes(minutes)}`}</span>;
  if (closed) return <span className="state-badge state-pause">Sem resposta registrada</span>;
  if (due && Date.now() > Date.parse(due)) return <span className="state-badge state-breach">Violado há {formatElapsed(due)}</span>;
  return <span className="state-badge state-neutral">Vence {formatShortDateTime(due)}</span>;
}
export function EvaluationSummary({ sent, answered, resolved, csat, ces }: { sent?: boolean | null | undefined; answered?: string | null | undefined; resolved?: string | null | undefined; csat?: number | null | undefined; ces?: number | null | undefined }) {
  if (answered && resolved && resolved !== 'yes') return <span className="state-badge state-breach">não resolvido</span>;
  if (answered) return <span className="font-mono">CSAT {csat} · CES {ces}</span>;
  if (sent) return <span className="text-muted-foreground">aguardando</span>;
  return <span className="text-muted-foreground">—</span>;
}

export function Conditions({ items }: { items: { label: string; met: boolean }[] }) {
  if (!items.length) return null;
  return <ul className="condition-list">{items.map((c) => <li key={c.label} className={c.met ? 'condition-met' : 'condition-pending'}><span aria-hidden="true">{c.met ? '✓' : '!'}</span>{c.label}<span className="sr-only">{c.met ? ' — atendida' : ' — pendente'}</span></li>)}</ul>;
}

export function ErrorState({ error, retry }: { error: unknown; retry?: (() => void) | undefined }) {
  return <div className="data-message" role="alert"><p>{error instanceof Error ? error.message : 'Não foi possível carregar os dados.'}</p>{retry && <Button variant="outline" onClick={retry}>Tentar novamente</Button>}</div>;
}
export function LoadingState({ label = 'Carregando…' }: { label?: string | undefined }) {
  return <div className="data-message" role="status"><span className="loading-bar" aria-hidden="true" />{label}</div>;
}
export function FieldError({ message, id }: { message?: string | undefined; id?: string | undefined }) {
  return message ? <span className="field-error" id={id} role="alert">{message}</span> : null;
}
export function PageHeading({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: string; subtitle?: string | undefined; actions?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{subtitle && <p className="page-subtitle">{subtitle}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}

export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  // Neutralize spreadsheet formula injection: text starting with = + - @ tab or CR gets a leading apostrophe.
  const quote = (v: unknown) => {
    let text = String(v ?? '');
    if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = '\uFEFF' + [header, ...rows].map((r) => r.map(quote).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
