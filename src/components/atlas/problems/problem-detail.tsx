import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, UserRoundCog } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { transitionProblem } from '@/lib/problems.functions';
import { problemDetailOptions } from '@/lib/problem-queries';
import { AnalysisSection } from '../detail/occurrence-analysis';
import { Conditions, FieldError, SeverityBadge, StateBadge, formatDate, formatDateTime, problemStatusLabels, roleLabels, todayInSaoPaulo } from '../occurrence-ui';
import { transitionsOf } from '../detail/types';

const steps: [string, string][] = [['open', 'Aberto'], ['analysis', 'Em análise'], ['action_plan', 'Plano de ação'], ['effectiveness_check', 'Verificação de eficácia'], ['closed', 'Encerrado']];
type Action = 'assign_owner' | 'start_analysis' | 'plan_actions' | 'start_verification' | 'record_effectiveness' | 'cancel';

export function ProblemDetail({ id }: { id: string }) {
  const { data } = useSuspenseQuery(problemDetailOptions(id));
  const qc = useQueryClient();
  const transition = useServerFn(transitionProblem);
  const [open, setOpen] = useState<Action | ''>('');
  const [body, setBody] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [criteria, setCriteria] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [effective, setEffective] = useState<'yes' | 'no' | ''>('');
  const [error, setError] = useState('');
  const invalidate = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['problem', id] }), qc.invalidateQueries({ queryKey: ['problems'] }), qc.invalidateQueries({ queryKey: ['dashboard'] })]); };
  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof transition>[0]['data']) => transition({ data: payload }),
    onSuccess: async (_r, v) => { toast.success(v.action === 'assign_owner' ? 'Dono definido.' : 'Problema atualizado.'); close(); await invalidate(); },
    onError: (e) => setError(e.message),
  });
  function close() { setOpen(''); setBody(''); setOwnerId(''); setCriteria(''); setDueDate(''); setEffective(''); setError(''); }
  if (!data) return <main className="atlas-main"><Button variant="link" asChild><Link to="/problemas"><ArrowLeft />Problemas</Link></Button><div className="data-message"><h1>Problema indisponível</h1><p>O registro não existe ou a sua conta não tem acesso a ele.</p></div></main>;
  const p = data.problem;
  const transitions = transitionsOf(data.transitions);
  const manage = transitions.length > 0;
  const ended = p.status === 'closed' || p.status === 'cancelled';
  const stepIndex = Math.max(0, steps.findIndex(([s]) => s === p.status));
  const owners = data.team.filter((m) => m.role === 'kam' || m.role === 'ops_manager');
  const today = todayInSaoPaulo();

  function submit() {
    setError('');
    if (open === 'assign_owner') { if (!ownerId) return setError('Selecione o dono.'); return mutation.mutate({ id, action: 'assign_owner', ownerId }); }
    if (open === 'start_verification') {
      if (criteria.trim().length < 10 || !/\d/.test(criteria)) return setError('O critério deve ser mensurável e conter número ou percentual, por exemplo: “zero reincidências em 60 dias”.');
      if (!dueDate || dueDate <= today) return setError('Defina uma data futura para a verificação.');
      return mutation.mutate({ id, action: 'start_verification', criteria: criteria.trim(), dueDate });
    }
    if (open === 'record_effectiveness') {
      if (!effective) return setError('Informe se a solução foi efetiva.');
      if (body.trim().length < 10) return setError('Descreva a evidência com pelo menos 10 caracteres.');
      return mutation.mutate({ id, action: 'record_effectiveness', effective: effective === 'yes', body: body.trim() });
    }
    if (open === 'cancel') { if (body.trim().length < 10) return setError('Descreva o motivo com pelo menos 10 caracteres.'); return mutation.mutate({ id, action: 'cancel', body: body.trim() }); }
    if (open) mutation.mutate({ id, action: open });
  }
  const run = (action: Action) => { setError(''); if (action === 'start_analysis' || action === 'plan_actions') mutation.mutate({ id, action }); else setOpen(action); };

  return (
    <main className="atlas-main">
      <Button variant="link" asChild><Link to="/problemas"><ArrowLeft />Problemas</Link></Button>
      <div className="detail-head">
        <div>
          <div className="detail-protocol"><span className="font-mono">{p.code}</span><span className={`state-badge ${p.status === 'closed' ? 'state-ok' : p.status === 'cancelled' ? 'state-pause' : 'state-neutral'}`}>{problemStatusLabels[p.status ?? '']}</span></div>
          <h1>{p.title}</h1>
          <p className="page-subtitle">{p.account_name ?? 'Entre contas'} · {p.category_name ?? 'Todas as categorias'} · dono: {p.owner_name ?? 'não definido'} · aberto em {formatDateTime(p.created_at)}</p>
        </div>
        {manage && !ended && <div className="heading-actions"><Button variant="outline" size="sm" onClick={() => setOpen('assign_owner')}><UserRoundCog />{p.owner_id ? 'Trocar dono' : 'Definir dono'}</Button></div>}
      </div>

      <section className="work-section">
        <h2>Status e próximo passo</h2>
        <ol className="stepper">{steps.map(([s, label], i) => <li key={s} className={p.status === 'cancelled' ? '' : i < stepIndex || p.status === 'closed' ? 'step-complete' : i === stepIndex ? 'step-current' : ''}><span>{i < stepIndex || p.status === 'closed' ? <Check size={13} /> : i + 1}</span>{label}</li>)}</ol>
        {p.status === 'effectiveness_check' && <p className="status-context">Critério: {p.effectiveness_criteria} · verificar a partir de {formatDate(p.effectiveness_due_date)}. Uma nova ocorrência da mesma causa neste período reprova a eficácia automaticamente.</p>}
        {p.status === 'closed' && <p className="status-context">Eficácia confirmada em {formatDateTime(p.effectiveness_checked_at)}. Evidência: {p.effectiveness_evidence}</p>}
        {error && !open && <p className="form-error" role="alert">{error}</p>}
        {transitions.length ? (
          <div className="transition-grid">{transitions.map((t, i) => <div key={t.action} className="transition-item"><Button variant={i === 0 && t.action !== 'cancel' ? 'default' : t.action === 'cancel' ? 'ghost' : 'outline'} disabled={!t.allowed || mutation.isPending} onClick={() => run(t.action as Action)}>{t.label}</Button><Conditions items={t.conditions} /></div>)}</div>
        ) : <p className="text-muted-foreground">{ended ? 'Problema encerrado.' : 'Somente o KAM ou o gestor com acesso pode avançar este problema.'}</p>}
      </section>

      <section className="work-section">
        <div className="section-title"><h2>Ocorrências vinculadas</h2><span className="font-mono text-muted-foreground">{data.occurrences.length}</span></div>
        {data.occurrences.length ? (
          <div className="table-scroll"><table className="atlas-table"><thead><tr><th>Nº</th><th>Conta</th><th>Assunto</th><th>Sev.</th><th>Status</th><th>Aberta em</th></tr></thead><tbody>
            {data.occurrences.map((o) => <tr key={o.id}><td><Link className="protocol-link" to="/ocorrencias/$id" params={{ id: o.id }}>{o.protocol}</Link></td><td>{o.accounts?.name}</td><td>{o.subject}</td><td><SeverityBadge severity={o.severity} /></td><td><StateBadge status={o.status} /></td><td className="font-mono">{formatDateTime(o.created_at)}</td></tr>)}
          </tbody></table></div>
        ) : <p className="empty-row">Nenhuma ocorrência vinculada. Vincule pelo detalhe da ocorrência.</p>}
      </section>

      <AnalysisSection
        scope={{ occurrenceId: null, problemId: id }}
        causes={data.causes}
        actions={data.actions}
        team={data.team}
        canEdit={manage && !ended && (p.status === 'analysis' || p.status === 'action_plan' || p.status === 'open')}
        invalidate={invalidate}
        exportName={p.code ?? 'problema'}
        eightD={{ team: [p.owner_name, ...data.team.filter((m) => m.id !== p.owner_id).map((m) => m.full_name)].filter(Boolean).join(', '), problem: `${p.title} · ${data.occurrences.length} ocorrência(s) vinculada(s)`, closure: p.status === 'closed' ? `Eficácia confirmada: ${p.effectiveness_evidence ?? ''}` : p.status === 'cancelled' ? 'Cancelado' : 'Em andamento' }}
      />

      <section className="work-section">
        <h2>Histórico do problema</h2>
        <div className="timeline">{data.events.map((e) => <article key={e.id} className="timeline-item"><div className="timeline-meta"><span className="font-mono">{formatDateTime(e.created_at)}</span>{e.to_status && <span className="state-badge state-neutral">{problemStatusLabels[e.to_status]}</span>}{e.author_id && data.authors[e.author_id] && <span className="text-muted-foreground">· {data.authors[e.author_id]}</span>}</div>{e.body && <p>{e.body}</p>}</article>)}</div>
        {!data.events.length && <p className="empty-row">Sem registros.</p>}
      </section>

      <Dialog open={Boolean(open)} onOpenChange={(v) => { if (!v) close(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{open === 'assign_owner' ? 'Dono do problema' : open === 'start_verification' ? 'Iniciar verificação de eficácia' : open === 'record_effectiveness' ? 'Resultado da verificação de eficácia' : 'Cancelar problema'}</DialogTitle>
            <DialogDescription>{open === 'assign_owner' ? 'O dono deve ser KAM ou gestor com acesso à conta e recebe aviso por e-mail.' : open === 'start_verification' ? 'Defina um critério mensurável e a data a partir da qual a eficácia pode ser confirmada.' : open === 'record_effectiveness' ? 'Não efetiva devolve o problema para Em análise e notifica o gestor.' : 'O histórico é mantido e as ocorrências continuam vinculadas.'}</DialogDescription>
          </DialogHeader>
          <form id="problem-transition" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            {open === 'assign_owner' && <label className="field" htmlFor="owner-select">Dono<select id="owner-select" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}><option value="">Selecionar</option>{owners.map((m) => <option key={m.id} value={m.id}>{m.full_name} · {roleLabels[m.role]}</option>)}</select></label>}
            {open === 'start_verification' && <><label className="field" htmlFor="criteria">Critério de eficácia<Input id="criteria" value={criteria} onChange={(e) => setCriteria(e.target.value)} maxLength={1000} placeholder="Ex.: zero reincidências em 60 dias" /></label><label className="field" htmlFor="due">Verificar a partir de<Input id="due" type="date" min={today} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label></>}
            {open === 'record_effectiveness' && <><fieldset className="choice-row"><legend className="field-label">A solução foi efetiva?</legend><label className={`choice-pill ${effective === 'yes' ? 'is-selected' : ''}`}><input type="radio" name="effective" checked={effective === 'yes'} onChange={() => setEffective('yes')} disabled={Boolean(p.effectiveness_due_date && today < p.effectiveness_due_date)} />Efetiva</label><label className={`choice-pill ${effective === 'no' ? 'is-selected' : ''}`}><input type="radio" name="effective" checked={effective === 'no'} onChange={() => setEffective('no')} />Não efetiva</label></fieldset>{p.effectiveness_due_date && today < p.effectiveness_due_date && <p className="field-hint">“Efetiva” fica disponível a partir de {formatDate(p.effectiveness_due_date)}.</p>}<label className="field" htmlFor="eff-body">Evidência<Textarea id="eff-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Dados que comprovam o resultado do critério" /></label></>}
            {open === 'cancel' && <label className="field" htmlFor="cancel-body">Motivo<Textarea id="cancel-body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} /></label>}
            <FieldError message={error} />
          </form>
          <DialogFooter><Button variant="outline" onClick={close}>Voltar</Button><Button type="submit" form="problem-transition" variant={open === 'cancel' ? 'destructive' : 'default'} disabled={mutation.isPending}>{mutation.isPending ? 'Salvando…' : 'Confirmar'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
