import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Link2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { resendEvaluation } from '@/lib/occurrences.functions';
import { createProblem, linkProblem } from '@/lib/problems.functions';
import { FieldError, channelLabels, formatDateTime, levelLabels, problemStatusLabels, typeLabels, urgencyLabels } from '../occurrence-ui';
import { isManager, type OccurrenceDetailData } from './types';

export function OccurrenceData({ data }: { data: OccurrenceDetailData }) {
  const o = data.occurrence;
  return (
    <aside className="work-section occurrence-data" aria-labelledby="data-title">
      <h2 id="data-title">Dados da ocorrência</h2>
      <dl>
        <dt>Tipo</dt><dd>{typeLabels[o.type]}</dd>
        <dt>Canal</dt><dd>{channelLabels[o.channel]}</dd>
        <dt>Categoria</dt><dd>{o.categories?.name}{data.subcategoryName ? ` · ${data.subcategoryName}` : ''}</dd>
        <dt>Impacto · urgência</dt><dd>{levelLabels[o.impact]} · {urgencyLabels[o.urgency]}</dd>
        <dt>Contato</dt><dd>{o.account_contacts?.name}{o.account_contacts?.job_title ? ` · ${o.account_contacts.job_title}` : ''}</dd>
        <dt>Ocorreu em</dt><dd className="font-mono">{formatDateTime(o.occurred_at)}</dd>
        <dt>Referências</dt><dd>{o.references_text || '—'}</dd>
        <dt>Impacto financeiro</dt><dd className="font-mono">{o.financial_impact === null ? '—' : o.financial_impact.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</dd>
        <dt>Relato do cliente</dt><dd className="prewrap">{o.description}</dd>
      </dl>
      <div className="expectation-box"><h3>Expectativa do cliente</h3><p className="prewrap">{o.customer_expectation}</p></div>
    </aside>
  );
}

export function ProblemCard({ data }: { data: OccurrenceDetailData }) {
  const o = data.occurrence;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useServerFn(createProblem);
  const link = useServerFn(linkProblem);
  const [dialog, setDialog] = useState(false);
  const [title, setTitle] = useState(`${o.categories?.name ?? 'Ocorrência'} recorrente · ${o.accounts?.name ?? ''}`.slice(0, 140));
  const [error, setError] = useState('');
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['occurrence', o.id] }), qc.invalidateQueries({ queryKey: ['problems'] })]); };
  const linkMutation = useMutation({ mutationFn: (problemId: string) => link({ data: { occurrenceId: o.id, problemId } }), onSuccess: async () => { toast.success('Ocorrência vinculada ao problema.'); await refresh(); }, onError: (e) => toast.error(e.message) });
  const createMutation = useMutation({
    mutationFn: () => create({ data: { title: title.trim(), accountId: o.account_id, categoryId: o.category_id, occurrenceId: o.id } }),
    onSuccess: async (r) => { toast.success('Problema aberto e ocorrência vinculada.'); setDialog(false); await refresh(); await navigate({ to: '/problemas/$id', params: { id: r.id } }); },
    onError: (e) => setError(e.message),
  });
  const r = data.recurrence;
  const manager = isManager(data);
  if (o.type === 'request') return null;
  return (
    <section className="work-section side-card" aria-labelledby="problem-title">
      <h2 id="problem-title">Recorrência e problema</h2>
      {data.problem ? (
        <div className="linked-problem">
          <Link to="/problemas/$id" params={{ id: data.problem.id }} className="protocol-link">{data.problem.code}</Link>
          <span className="state-badge state-neutral">{problemStatusLabels[data.problem.status]}</span>
          <p>{data.problem.title}</p>
          {data.problem.effectiveness_criteria && <p className="text-muted-foreground">Eficácia: {data.problem.effectiveness_criteria}</p>}
        </div>
      ) : <p className="text-muted-foreground">Sem problema vinculado.</p>}
      {r && (
        <p className={r.suggest ? 'recurrence-alert' : 'text-muted-foreground'}>
          {r.suggest && <AlertTriangle size={15} aria-hidden="true" />}
          {r.same_account_90d} nesta conta e {r.same_category_90d} na categoria em 90 dias.{r.suggest && !data.problem ? ' Recorrência: avalie abrir um problema.' : ''}
        </p>
      )}
      {!data.problem && manager && (
        <div className="side-actions">
          {r?.open_problems.map((p) => <Button key={p.id} variant="outline" size="sm" disabled={linkMutation.isPending} onClick={() => linkMutation.mutate(p.id)}><Link2 />Vincular a {p.code}</Button>)}
          <Button variant={r?.suggest ? 'default' : 'outline'} size="sm" onClick={() => { setError(''); setDialog(true); }}><Plus />Abrir problema</Button>
        </div>
      )}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Abrir problema</DialogTitle><DialogDescription>O problema agrupa ocorrências da mesma causa para análise de causa raiz e verificação de eficácia. Esta ocorrência será vinculada.</DialogDescription></DialogHeader>
          <form id="problem-form" onSubmit={(e) => { e.preventDefault(); if (title.trim().length < 5) { setError('O título precisa de pelo menos 5 caracteres.'); return; } createMutation.mutate(); }}>
            <label className="field" htmlFor="problem-title-input">Título<Input id="problem-title-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} /></label>
            <FieldError message={error} />
          </form>
          <DialogFooter><Button variant="outline" onClick={() => setDialog(false)}>Cancelar</Button><Button type="submit" form="problem-form" disabled={createMutation.isPending}>{createMutation.isPending ? 'Abrindo…' : 'Abrir e vincular'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

const resolvedLabels: Record<string, string> = { yes: 'Sim, resolvido', partial: 'Parcialmente', no: 'Não resolvido' };
const dispatchLabels: Record<string, string> = { pending: 'na fila de envio', retry: 'nova tentativa agendada', sending: 'enviando', sent: 'enviado', failed: 'falhou', suppressed: 'bloqueado: destinatário descadastrado', skipped: 'não enviado: endereço de teste' };

export function EvaluationCard({ data, canWork }: { data: OccurrenceDetailData; canWork: boolean }) {
  const o = data.occurrence;
  const e = data.evaluation;
  const d = data.surveyDispatch;
  const resend = useServerFn(resendEvaluation);
  const qc = useQueryClient();
  const mutation = useMutation({ mutationFn: () => resend({ data: { id: o.id } }), onSuccess: async () => { toast.success('Pesquisa reenviada ao cliente.'); await qc.invalidateQueries({ queryKey: ['occurrence', o.id] }); }, onError: (err) => toast.error(err.message) });
  if (!e && o.status !== 'solution_proposed') return null;
  const currentCycle = e?.cycle === o.reopen_count + 1;
  const canResend = canWork && o.status === 'solution_proposed' && currentCycle && !e?.answered_at && d?.status !== 'pending' && d?.status !== 'sending' && d?.status !== 'retry';
  return (
    <section className="work-section side-card" aria-labelledby="evaluation-title">
      <h2 id="evaluation-title">Avaliação do cliente</h2>
      {e ? (
        <dl>
          <dt>Ciclo</dt><dd className="font-mono">{e.cycle}</dd>
          <dt>Enviada em</dt><dd className="font-mono">{formatDateTime(e.sent_at)}</dd>
          {e.answered_at ? (
            <>
              <dt>Respondida em</dt><dd className="font-mono">{formatDateTime(e.answered_at)}</dd>
              <dt>Resultado</dt><dd>{resolvedLabels[e.resolved ?? ''] ?? '—'}</dd>
              <dt>CSAT · CES</dt><dd className="font-mono">{e.csat ?? '—'} / 5 · {e.ces ?? '—'} / 7</dd>
            </>
          ) : (
            <>
              <dt>Lembretes</dt><dd className="font-mono">{e.reminders_sent} de 2</dd>
              <dt>Link válido até</dt><dd className="font-mono">{formatDateTime(e.token_expires_at)}</dd>
            </>
          )}
          {d && <><dt>Último envio</dt><dd>{dispatchLabels[d.status] ?? d.status}{d.status === 'failed' && d.last_error ? ` · ${d.last_error}` : ''}</dd></>}
        </dl>
      ) : (
        <dl>
          <dt>Envio da pesquisa</dt><dd>{d ? dispatchLabels[d.status] ?? d.status : 'na fila de envio'}</dd>
          {d?.status === 'failed' && <><dt>Motivo</dt><dd>{d.last_error ?? 'falha no envio'}</dd></>}
          {d && ['skipped', 'suppressed', 'failed'].includes(d.status) && <dd className="field-hint">Sem envio, o link de avaliação não é gerado e a ocorrência não encerra sozinha. Corrija o contato ou reenvie a pesquisa.</dd>}
        </dl>
      )}
      {canResend && <Button variant="outline" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}><RefreshCw />{mutation.isPending ? 'Reenviando…' : 'Reenviar pesquisa'}</Button>}
    </section>
  );
}
