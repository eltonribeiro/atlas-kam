import { Link } from '@tanstack/react-router';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { detailOptions } from '@/lib/occurrence-queries';
import { Attachments } from './attachments';
import { ContestationReview } from './contestation-review';
import { AnalysisSection } from './detail/occurrence-analysis';
import { AssignmentActions } from './detail/occurrence-assignment';
import { OccurrenceCommunication } from './detail/occurrence-communication';
import { EvaluationCard, OccurrenceData, ProblemCard } from './detail/occurrence-side';
import { OccurrenceWorkflow } from './detail/occurrence-workflow';
import { canWorkOn, isManager } from './detail/types';
import { CLOSED, DateTime, FirstResponseBadge, SeverityBadge, SlaBadge, StateBadge, formatDateTime } from './occurrence-ui';

export { detailOptions };

export function OccurrenceDetail({ id }: { id: string }) {
  const { data } = useSuspenseQuery(detailOptions(id));
  const qc = useQueryClient();
  if (!data) {
    return <main className="atlas-main"><Button variant="link" asChild><Link to="/ocorrencias"><ArrowLeft />Ocorrências</Link></Button><div className="data-message"><h1>Ocorrência indisponível</h1><p>O registro não existe ou a sua conta não tem acesso a ele.</p></div></main>;
  }
  const o = data.occurrence;
  const closed = CLOSED.includes(o.status);
  const canWork = canWorkOn(data);
  const manager = isManager(data);
  const consumed = data.sla?.consumed_percent;
  const invalidate = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['occurrence', id] }), qc.invalidateQueries({ queryKey: ['occurrences'] })]); };
  const kamName = data.kamName ?? data.team.find((m) => m.id === o.accounts?.kam_id)?.full_name;

  return (
    <main className="atlas-main">
      <Button variant="link" asChild><Link to="/ocorrencias"><ArrowLeft />Ocorrências</Link></Button>
      <div className="detail-head">
        <div>
          <div className="detail-protocol"><span className="font-mono">{o.protocol}</span><SeverityBadge severity={o.severity} withName /><StateBadge status={o.status} />{o.reopen_count > 0 && <span className="state-badge state-breach">{o.reopen_count} {o.reopen_count === 1 ? 'reabertura' : 'reaberturas'}</span>}</div>
          <h1>{o.subject}</h1>
          <p className="page-subtitle">{o.accounts?.name} · aberta em <DateTime value={o.created_at} /> · responsável: {data.assigneeName ?? 'não atribuído'}{kamName ? ` · KAM: ${kamName}` : ''}</p>
        </div>
        {manager && !closed && <div className="heading-actions"><AssignmentActions data={data} /></div>}
      </div>

      <div className="metric-grid">
        <div><p>1ª resposta</p><FirstResponseBadge at={o.first_response_at} due={o.first_response_due_at} breached={o.first_response_breached} minutes={null} closed={closed} /><span className="font-mono">{o.first_response_at ? `em ${formatDateTime(o.first_response_at)}` : `prazo ${formatDateTime(o.first_response_due_at)}`}</span></div>
        <div><p>Solução · ciclo {o.reopen_count + 1}</p>{closed ? <span className="state-badge state-pause">{o.resolution_breached ? 'Encerrada · prazo violado' : 'Encerrada'}</span> : <SlaBadge state={data.sla?.sla_state} due={o.resolution_due_at} pausedSince={o.paused_since} />}<span className="font-mono">{consumed !== null && consumed !== undefined && !closed ? `${Math.round(consumed)}% do prazo consumido` : `prazo ${formatDateTime(o.resolution_due_at)}`}</span></div>
        <div><p>Plano de ação</p><strong>{data.actions.filter((a) => a.status === 'done').length} de {data.actions.length}</strong><span>{data.causes.filter((c) => c.status === 'confirmed').length} causa(s) confirmada(s)</span></div>
        <div><p>Próxima atualização ao cliente</p><strong className="font-mono">{closed || o.status === 'awaiting_customer' ? '—' : formatDateTime(o.next_update_due_at)}</strong><span>{o.status === 'awaiting_customer' ? 'pausada enquanto aguarda o cliente' : 'conforme a severidade'}</span></div>
      </div>

      <OccurrenceWorkflow data={data} />
      <ContestationReview id={id} />
      <AnalysisSection
        scope={{ occurrenceId: o.id, problemId: null }}
        causes={data.causes}
        actions={data.actions}
        team={data.team.filter((m) => m.role !== 'admin')}
        canEdit={canWork}
        invalidate={invalidate}
        exportName={o.protocol}
        allowEvidenceUpload
        eightD={{ team: [data.assigneeName, kamName].filter(Boolean).join(', '), problem: `${o.subject}. ${o.description}`, closure: closed ? `Encerrada em ${formatDateTime(o.closed_at)}` : 'Em andamento' }}
      />
      <div className="detail-columns">
        <div className="detail-stack">
          <OccurrenceCommunication data={data} canWork={canWork} />
          <Attachments id={id} canUpload={canWork || (manager && !closed)} actions={data.actions} />
        </div>
        <div className="detail-stack">
          <OccurrenceData data={data} />
          <EvaluationCard data={data} canWork={canWork} />
          <ProblemCard data={data} />
        </div>
      </div>
    </main>
  );
}
