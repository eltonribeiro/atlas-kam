import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, PauseCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { transitionOccurrence } from '@/lib/occurrences.functions';
import { ClassificationReview } from '../classification-review';
import { Conditions, formatDateTime, formatElapsed } from '../occurrence-ui';
import { transitionsOf, type OccurrenceDetailData } from './types';

const steps = ['Registrada', 'Em análise', 'Em tratativa', 'Solução proposta', 'Encerrada'];
const direct = new Set(['assume', 'start_treatment', 'confirm_classification']);
const textForms: Record<string, { title: string; label: string; min: number; placeholder: string; notice: string; submit: string }> = {
  ask_customer: { title: 'Pedir informação ao cliente', label: 'Pergunta ao cliente', min: 10, placeholder: 'Qual informação falta para avançar? Seja específico.', notice: 'O cliente recebe a pergunta por e-mail e o relógio de solução pausa até a resposta.', submit: 'Enviar pergunta e pausar SLA' },
  customer_replied: { title: 'Registrar resposta do cliente', label: 'Resumo da resposta', min: 5, placeholder: 'O que o cliente informou?', notice: 'O relógio de solução retoma a partir de agora.', submit: 'Registrar e retomar SLA' },
  propose_solution: { title: 'Registrar solução', label: 'Solução aplicada', min: 20, placeholder: 'O que foi feito e como isso resolve o problema do cliente.', notice: 'O cliente recebe a solução com a pesquisa de avaliação (válida por 5 dias úteis, com lembretes no 2º e 4º dia).', submit: 'Registrar solução e enviar pesquisa' },
};

export function OccurrenceWorkflow({ data }: { data: OccurrenceDetailData }) {
  const o = data.occurrence;
  const transition = useServerFn(transitionOccurrence);
  const qc = useQueryClient();
  const [open, setOpen] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const transitions = transitionsOf(data.transitions);
  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ['occurrence', o.id] }), qc.invalidateQueries({ queryKey: ['occurrences'] }), qc.invalidateQueries({ queryKey: ['dashboard'] }), qc.invalidateQueries({ queryKey: ['notifications'] })]);
  };
  const mutation = useMutation({
    mutationFn: (v: { action: string; body: string; label: string }) => transition({ data: { id: o.id, action: v.action, body: v.body } }),
    onSuccess: async (_r, v) => { setOpen(''); setBody(''); setError(''); setReviewed(false); toast.success(`${v.label}: concluído.`); await refresh(); },
    onError: (e) => setError(e.message),
  });
  const step = o.status === 'registered' ? 0 : o.status === 'in_analysis' ? 1 : ['in_treatment', 'awaiting_customer', 'reopened'].includes(o.status) ? 2 : o.status === 'solution_proposed' ? 3 : 4;
  const primary = transitions.find((t) => t.allowed && t.action !== 'change_classification' && t.action !== 'mark_unfounded');
  const form = textForms[open];
  const run = (t: { action: string; label: string }) => {
    setError('');
    if (direct.has(t.action)) mutation.mutate({ action: t.action, body: '', label: t.label });
    else { setOpen(t.action); setBody(''); }
  };

  return (
    <section className="work-section" aria-labelledby="next-step-title">
      <h2 id="next-step-title">Status e próximo passo</h2>
      <ol className="stepper">
        {steps.map((s, i) => <li key={s} className={i < step ? 'step-complete' : i === step ? 'step-current' : ''} aria-current={i === step ? 'step' : undefined}><span>{i < step ? <Check size={13} /> : i + 1}</span>{s}</li>)}
      </ol>
      <StatusContext data={data} />
      {error && !open && <p className="form-error" role="alert">{error}</p>}
      {transitions.length > 0 ? (
        <div className="transition-grid">
          {transitions.map((t) => (
            <div key={t.action} className="transition-item">
              <Button variant={t === primary ? 'default' : 'outline'} disabled={!t.allowed || mutation.isPending} onClick={() => run(t)}>{t.label}</Button>
              <Conditions items={t.conditions} />
              {t.action === 'start_treatment' && !t.conditions.find((c) => c.label.startsWith('Primeira'))?.met && <p className="field-hint">Registre a 1ª resposta como “Atualização ao cliente” em Comunicação.</p>}
              {t.action === 'start_treatment' && !t.conditions.find((c) => c.label.startsWith('Ação'))?.met && <p className="field-hint">Cadastre uma ação de contenção no plano de ação.</p>}
            </div>
          ))}
        </div>
      ) : <p className="text-muted-foreground">{data.role === 'admin' ? 'Perfil de administrador: acompanhamento somente leitura.' : 'Nenhuma mudança de etapa disponível para o seu perfil neste momento.'}</p>}

      {open === 'change_classification' && (
        <ClassificationReview id={o.id} impact={o.impact} urgency={o.urgency} categoryId={o.category_id} onCancel={() => setOpen('')} onSaved={async () => { setOpen(''); toast.success('Classificação revisada.'); await refresh(); }} />
      )}

      <Dialog open={Boolean(form)} onOpenChange={(v) => { if (!v) setOpen(''); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.title}</DialogTitle><DialogDescription>{form?.notice}</DialogDescription></DialogHeader>
          <form id="transition-form" onSubmit={(e) => { e.preventDefault(); if (!form) return; if (body.trim().length < form.min) { setError(`Escreva pelo menos ${form.min} caracteres.`); return; } mutation.mutate({ action: open, body: body.trim(), label: form.title }); }}>
            <label className="field" htmlFor="transition-body">{form?.label}<Textarea id="transition-body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder={form?.placeholder} aria-invalid={Boolean(error) || undefined} /></label>
            <p className="field-hint font-mono">{body.trim().length} / mínimo {form?.min}</p>
            {open === 'propose_solution' && <div className="expectation-box"><h3>Expectativa do cliente</h3><p>{o.customer_expectation}</p></div>}
            {error && <p className="form-error" role="alert">{error}</p>}
          </form>
          <DialogFooter><Button variant="outline" onClick={() => setOpen('')}>Cancelar</Button><Button type="submit" form="transition-form" disabled={mutation.isPending}>{mutation.isPending ? 'Salvando…' : form?.submit}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open === 'mark_unfounded'} onOpenChange={(v) => { if (!v) setOpen(''); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Marcar como improcedente</DialogTitle><DialogDescription>O cliente recebe a justificativa e pode contestar em até 5 dias úteis. A contestação volta para revisão do KAM ou gestor.</DialogDescription></DialogHeader>
          <form id="unfounded-form" onSubmit={(e) => { e.preventDefault(); if (body.trim().length < 30) { setError('A justificativa precisa de pelo menos 30 caracteres.'); return; } if (!reviewed) { setError('Confirme que a evidência anexada sustenta a decisão.'); return; } mutation.mutate({ action: 'mark_unfounded', body: body.trim(), label: 'Marcar como improcedente' }); }}>
            <label className="field" htmlFor="unfounded-body">Justificativa ao cliente<Textarea id="unfounded-body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Por que a ocorrência não procede, com referência à evidência." /></label>
            <p className="field-hint font-mono">{body.trim().length} / mínimo 30</p>
            <label className="check-field"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />A evidência anexada sustenta esta decisão</label>
            {error && <p className="form-error" role="alert">{error}</p>}
          </form>
          <DialogFooter><Button variant="outline" onClick={() => setOpen('')}>Cancelar</Button><Button type="submit" form="unfounded-form" variant="destructive" disabled={mutation.isPending}>{mutation.isPending ? 'Salvando…' : 'Confirmar improcedência'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function StatusContext({ data }: { data: OccurrenceDetailData }) {
  const o = data.occurrence;
  if (o.status === 'awaiting_customer') return <p className="status-context state-pause-box"><PauseCircle size={16} />Aguardando o cliente{o.paused_since ? ` há ${formatElapsed(o.paused_since)} (desde ${formatDateTime(o.paused_since)})` : ''}. O relógio de solução está parado.</p>;
  if (o.status === 'solution_proposed') return <p className="status-context">Solução enviada em {formatDateTime(o.solution_proposed_at)}. Aguardando a avaliação do cliente; sem resposta em 5 dias úteis e após 2 lembretes, encerra como “sem avaliação”.</p>;
  if (o.status === 'reopened') return <p className="status-context state-breach-box">Reaberta pelo cliente · ciclo {o.reopen_count + 1}. Novo prazo de solução: {formatDateTime(o.resolution_due_at)}.</p>;
  if (o.status === 'closed_unfounded') return <p className="status-context">Encerrada como improcedente em {formatDateTime(o.closed_at)}.{o.unfounded_justification ? ` Justificativa: ${o.unfounded_justification}` : ''}</p>;
  if (o.status === 'closed_resolved' || o.status === 'closed_no_evaluation') return <p className="status-context">Encerrada em {formatDateTime(o.closed_at)}.</p>;
  if (o.status === 'registered') return <p className="status-context">Aguardando um responsável assumir. A 1ª resposta vence em {formatDateTime(o.first_response_due_at)}.</p>;
  return null;
}
