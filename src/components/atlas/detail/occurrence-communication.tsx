import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { communicateOccurrence } from '@/lib/occurrences.functions';
import { FieldError, formatDateTime, statusLabels } from '../occurrence-ui';
import type { OccurrenceDetailData } from './types';

const kindLabels: Record<string, string> = {
  customer_update: 'Atualização ao cliente', customer_question: 'Pergunta ao cliente', internal_note: 'Nota interna', status_change: 'Mudança de etapa',
  customer_reply: 'Resposta do cliente', solution: 'Solução proposta', evaluation: 'Avaliação do cliente', system: 'Sistema',
};

export function OccurrenceCommunication({ data, canWork }: { data: OccurrenceDetailData; canWork: boolean }) {
  const o = data.occurrence;
  const communicate = useServerFn(communicateOccurrence);
  const qc = useQueryClient();
  const [kind, setKind] = useState<'customer_update' | 'internal_note'>(o.first_response_at ? 'internal_note' : 'customer_update');
  const [body, setBody] = useState('');
  const [filter, setFilter] = useState<'all' | 'customer' | 'internal' | 'system'>('all');
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: () => communicate({ data: { id: o.id, kind, body: body.trim() } }),
    onSuccess: async () => {
      toast.success(kind === 'internal_note' ? 'Nota interna salva.' : o.first_response_at ? 'Atualização registrada e enviada ao cliente.' : '1ª resposta registrada e enviada ao cliente.');
      setBody(''); setError('');
      await Promise.all([qc.invalidateQueries({ queryKey: ['occurrence', o.id] }), qc.invalidateQueries({ queryKey: ['occurrences'] }), qc.invalidateQueries({ queryKey: ['dashboard'] })]);
    },
    onError: (e) => setError(e.message),
  });
  const events = data.events.filter((e) => filter === 'all' || e.visibility === filter);
  const closed = ['closed_resolved', 'closed_no_evaluation', 'closed_unfounded'].includes(o.status);
  return (
    <section className="work-section" aria-labelledby="communication-title">
      <div className="section-title">
        <h2 id="communication-title">Comunicação e histórico</h2>
        <select aria-label="Filtrar histórico" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="all">Tudo</option><option value="customer">Visível ao cliente</option><option value="internal">Interno</option><option value="system">Sistema</option></select>
      </div>
      {canWork && !closed && (
        <form className="message-composer" onSubmit={(e) => { e.preventDefault(); if (!body.trim()) { setError('Escreva a mensagem.'); return; } mutation.mutate(); }}>
          <div className="composer-head">
            <select aria-label="Tipo de mensagem" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="customer_update">{o.first_response_at ? 'Atualização ao cliente' : '1ª resposta ao cliente'}</option><option value="internal_note">Nota interna</option></select>
            <span className="field-hint">{kind === 'internal_note' ? 'Visível somente para a equipe.' : `Enviada por e-mail ao contato, com cópia ao KAM.${o.next_update_due_at ? ` Próxima atualização devida até ${formatDateTime(o.next_update_due_at)}.` : ''}`}</span>
          </div>
          <Textarea aria-label="Mensagem" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={8000} placeholder={kind === 'internal_note' ? 'Registro interno da tratativa' : 'Escreva para o cliente: o que foi feito e o próximo passo'} />
          <FieldError message={error} />
          <Button disabled={mutation.isPending}><Send />{mutation.isPending ? 'Enviando…' : kind === 'internal_note' ? 'Salvar nota interna' : 'Registrar e enviar ao cliente'}</Button>
        </form>
      )}
      <div className="timeline">
        {events.map((e) => (
          <article key={e.id} className={`timeline-item visibility-${e.visibility}`}>
            <div className="timeline-meta">
              <span className="font-mono">{formatDateTime(e.created_at)}</span>
              <span className="state-badge state-neutral">{e.visibility === 'system' ? 'sistema' : e.visibility === 'internal' ? 'interno' : 'cliente'}</span>
              <span>{kindLabels[e.kind] ?? e.kind}</span>
              {e.author_id && data.authors[e.author_id] && <span className="text-muted-foreground">· {data.authors[e.author_id]}</span>}
            </div>
            {e.body ? <p>{e.body}</p> : null}
            {e.from_status || e.to_status ? <p className="text-muted-foreground">{statusLabels[e.from_status ?? ''] ?? '—'} → {statusLabels[e.to_status ?? ''] ?? '—'}</p> : null}
          </article>
        ))}
        {!events.length && <p className="empty-row">Nenhum registro neste filtro.</p>}
      </div>
    </section>
  );
}
