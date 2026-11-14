import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { keepPreviousData, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ClipboardList, Download, Filter, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { exportOccurrences } from '@/lib/occurrences.functions';
import { catalogOptions, dashboardOptions, listFilters, occurrenceListOptions } from '@/lib/occurrence-queries';
import type { OccurrenceFilters } from '@/lib/occurrence-filters';
import { periodRange } from '@/lib/occurrence-filters';
import { KpiGrid } from './kpi-grid';
import { CLOSED, ErrorState, EvaluationSummary, FirstResponseBadge, PageHeading, SeverityBadge, SlaBadge, StateBadge, downloadCsv, formatDateTime, statusLabels, typeLabels } from './occurrence-ui';

const periods = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
  { value: 365, label: '12 meses' },
] as const;

export function OccurrenceDashboard() {
  const search = useSearch({ from: '/_authenticated/ocorrencias/' });
  const navigate = useNavigate({ from: '/ocorrencias/' });
  const { data: catalog } = useSuspenseQuery(catalogOptions);
  const period = search.period ?? 30;
  const update = (patch: Partial<OccurrenceFilters>, resetPage = true) =>
    navigate({ search: (prev) => ({ ...prev, ...patch, ...(resetPage ? { page: undefined } : {}) }), replace: true });

  return (
    <main className="atlas-main">
      <PageHeading
        eyebrow="GESTÃO DE RECLAMAÇÕES · BASE ISO 10002"
        title="Ocorrências"
        subtitle="Como estamos no período, o que está em risco agora e onde está a causa recorrente."
        actions={<><ExportButton search={search} /><Button asChild><Link to="/ocorrencias/nova"><Plus />Nova ocorrência</Link></Button></>}
      />
      <div className="period-chips" role="group" aria-label="Período dos indicadores">
        {periods.map((p) => (
          <Button key={p.value} variant={period === p.value ? 'default' : 'outline'} size="sm" aria-pressed={period === p.value} onClick={() => update({ period: p.value === 30 ? undefined : p.value }, false)}>{p.label}</Button>
        ))}
        {search.account && <span className="chip-note">Indicadores de {catalog.accounts.find((a) => a.id === search.account)?.name ?? 'conta selecionada'}</span>}
      </div>
      <DashboardIndicators period={period} account={search.account} />
      <OccurrenceTable search={search} update={update} catalog={catalog} />
      <DashboardCharts period={period} account={search.account} />
    </main>
  );
}

function DashboardIndicators({ period, account }: { period: OccurrenceFilters['period']; account?: string | undefined }) {
  const q = useQuery({ ...dashboardOptions(period, account), placeholderData: keepPreviousData });
  if (q.error) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  if (!q.data) return <div className="kpi-grid" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <div key={i} className="kpi-card skeleton-card" />)}</div>;
  return <div className={q.isFetching ? 'is-refreshing' : ''}><KpiGrid current={q.data.current} previous={q.data.previous} /></div>;
}

function DashboardCharts({ period, account }: { period: OccurrenceFilters['period']; account?: string | undefined }) {
  const q = useQuery({ ...dashboardOptions(period, account), placeholderData: keepPreviousData });
  if (!q.data) return null;
  const { pareto, aging } = q.data;
  const bands = [
    { label: '0–2 dias úteis', value: aging.d0_2 },
    { label: '3–5 dias úteis', value: aging.d3_5 },
    { label: '6–10 dias úteis', value: aging.d6_10 },
    { label: 'Mais de 10 dias úteis', value: aging.d10_plus, alert: true },
  ];
  const max = Math.max(1, ...bands.map((b) => b.value));
  return (
    <div className="chart-columns">
      <section className="panel-card">
        <div className="section-title"><h2>Causas recorrentes · Pareto 90 dias</h2><span className="font-mono text-muted-foreground">{pareto.total} ocorrências</span></div>
        {!pareto.items.length ? <p className="text-muted-foreground">Sem reclamações ou incidentes nos últimos 90 dias.</p> : (
          <ul className="bar-list">
            {pareto.items.map((item) => (
              <li key={item.label}>
                <div className="bar-label"><span>{item.label}</span><span className="font-mono">{item.count} · {item.percent.toLocaleString('pt-BR')}%</span></div>
                <div className="bar-track" aria-hidden="true"><span style={{ width: `${item.percent}%` }} /></div>
              </li>
            ))}
          </ul>
        )}
        <Link to="/problemas" className="text-link">{pareto.open_problems} {pareto.open_problems === 1 ? 'problema aberto' : 'problemas abertos'} em RCA</Link>
      </section>
      <section className="panel-card">
        <div className="section-title"><h2>Aging do backlog em aberto</h2><span className="font-mono text-muted-foreground">{aging.total} abertas</span></div>
        <ul className="bar-list">
          {bands.map((b) => (
            <li key={b.label}>
              <div className="bar-label"><span>{b.label}</span><span className="font-mono">{b.value}</span></div>
              <div className={`bar-track ${b.alert ? 'bar-alert' : ''}`} aria-hidden="true"><span style={{ width: `${(100 * b.value) / max}%` }} /></div>
            </li>
          ))}
        </ul>
        <p className="panel-note">Acima de 10 dias úteis, escale a ocorrência ao gestor de operações.</p>
      </section>
    </div>
  );
}

type Catalog = { accounts: { id: string; name: string }[]; categories: { id: string; name: string; parent_id: string | null }[] };

function OccurrenceTable({ search, update, catalog }: { search: OccurrenceFilters; update: (patch: Partial<OccurrenceFilters>, resetPage?: boolean) => void; catalog: Catalog }) {
  const [text, setText] = useState(search.q ?? '');
  useEffect(() => setText(search.q ?? ''), [search.q]);
  useEffect(() => {
    const handle = setTimeout(() => { if ((search.q ?? '') !== text.trim()) update({ q: text.trim() || undefined }); }, 350);
    return () => clearTimeout(handle);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = useQuery({ ...occurrenceListOptions(search), placeholderData: keepPreviousData });
  const page = search.page ?? 1;
  const totalPages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;
  const hasFilters = Boolean(search.q || search.account || search.severity || search.category || search.risk || (search.status && search.status !== 'open'));
  return (
    <section className="work-section">
      <div className="section-title"><h2>Lista de ocorrências</h2><span className="font-mono text-muted-foreground" aria-live="polite">{q.data ? `${q.data.total} registros` : ''}{q.isFetching && q.data ? ' · atualizando…' : ''}</span></div>
      <div className="filter-row">
        <div className="search-field"><Search size={16} /><Input aria-label="Buscar por protocolo, conta ou assunto" value={text} onChange={(e) => setText(e.target.value)} placeholder="Protocolo, conta ou assunto" maxLength={100} /></div>
        <label className="select-field">Conta<select value={search.account ?? ''} onChange={(e) => update({ account: e.target.value || undefined })}><option value="">Todas</option>{catalog.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label className="select-field">Status<select value={search.status ?? 'open'} onChange={(e) => update({ status: e.target.value === 'open' ? undefined : (e.target.value as OccurrenceFilters['status']) })}><option value="open">Em aberto</option><option value="closed">Encerradas</option><option value="all">Todas</option></select></label>
        <label className="select-field">Severidade<select value={search.severity ?? ''} onChange={(e) => update({ severity: (e.target.value || undefined) as OccurrenceFilters['severity'] })}><option value="">Todas</option>{['S1', 'S2', 'S3', 'S4'].map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="select-field">Categoria<select value={search.category ?? ''} onChange={(e) => update({ category: e.target.value || undefined })}><option value="">Todas</option>{catalog.categories.filter((c) => !c.parent_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="check-field"><input type="checkbox" checked={Boolean(search.risk)} onChange={(e) => update({ risk: e.target.checked || undefined })} />Só SLA em risco ou violado</label>
        <Button variant="ghost" disabled={!hasFilters} onClick={() => { setText(''); update({ q: undefined, account: undefined, status: undefined, severity: undefined, category: undefined, risk: undefined }); }}><Filter />Limpar filtros</Button>
      </div>
      {q.error ? <ErrorState error={q.error} retry={() => void q.refetch()} /> : !q.data ? <TableSkeleton /> : (
        <>
          <div className="table-scroll">
            <table className="atlas-table">
              <thead><tr><th>Nº</th><th>Conta</th><th>Assunto</th><th>Sev.</th><th>Status</th><th>1ª resposta</th><th>Prazo de solução</th><th>Responsável</th><th>Avaliação</th></tr></thead>
              <tbody>
                {q.data.rows.map((o) => {
                  const closed = CLOSED.includes(o.status ?? '');
                  return (
                    <tr key={o.id ?? ''}>
                      <td><Link className="protocol-link" to="/ocorrencias/$id" params={{ id: o.id ?? '' }}>{o.protocol}</Link></td>
                      <td>{o.account_name}</td>
                      <td><strong>{o.subject}</strong><span className="table-secondary">{o.category_name}{o.type === 'request' ? ' · solicitação' : ''}</span></td>
                      <td><SeverityBadge severity={o.severity ?? 'S4'} /></td>
                      <td><StateBadge status={o.status ?? ''} /></td>
                      <td><FirstResponseBadge at={o.first_response_at} due={o.first_response_due_at} breached={o.first_response_breached} minutes={o.first_response_minutes} closed={closed} /></td>
                      <td>{closed ? <span className="state-badge state-pause">{o.resolution_breached ? 'Encerrada · violada' : 'Encerrada'}</span> : <SlaBadge state={o.sla_state} due={o.resolution_due_at} pausedSince={o.paused_since} />}</td>
                      <td>{o.assignee_name ?? <span className="text-muted-foreground">não atribuído</span>}</td>
                      <td><EvaluationSummary sent={o.evaluation_sent} answered={o.evaluation_answered_at} resolved={o.evaluation_resolved} csat={o.evaluation_csat} ces={o.evaluation_ces} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!q.data.rows.length && <div className="data-message"><ClipboardList size={28} /><h2>Nenhuma ocorrência com estes filtros</h2>{hasFilters ? <Button variant="outline" onClick={() => { setText(''); update({ q: undefined, account: undefined, status: undefined, severity: undefined, category: undefined, risk: undefined }); }}>Limpar filtros</Button> : <p>As ocorrências das suas contas aparecerão aqui.</p>}</div>}
          <div className="table-footer">
            <span>Prazos em horas e dias úteis do calendário do contrato · O relógio de SLA pausa em Aguardando cliente</span>
            <div>
              <Button variant="ghost" disabled={page <= 1} onClick={() => update({ page: page - 1 === 1 ? undefined : page - 1 }, false)}>Anterior</Button>
              <span className="font-mono">{page} / {totalPages}</span>
              <Button variant="ghost" disabled={page >= totalPages} onClick={() => update({ page: page + 1 }, false)}>Próxima</Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export function TableSkeleton() {
  return <div className="table-scroll" aria-busy="true" aria-label="Carregando ocorrências">{Array.from({ length: 8 }, (_, i) => <div key={i} className="ghost-row" />)}</div>;
}

function ExportButton({ search }: { search: OccurrenceFilters }) {
  const run = useServerFn(exportOccurrences);
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="outline" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const rows = await run({ data: listFilters(search) });
        downloadCsv(`atlas-ocorrencias-${periodRange(7).to}.csv`,
          ['Protocolo', 'Conta', 'Assunto', 'Categoria', 'Tipo', 'Severidade', 'Status', 'Responsável', 'Aberta em', '1ª resposta em', 'Prazo da 1ª resposta', 'Prazo de solução', 'Estado do SLA', 'Avaliação'],
          rows.map((o) => [o.protocol, o.account_name, o.subject, o.category_name, typeLabels[o.type ?? ''] ?? o.type, o.severity, statusLabels[o.status ?? ''] ?? o.status, o.assignee_name, formatDateTime(o.created_at), formatDateTime(o.first_response_at), formatDateTime(o.first_response_due_at), formatDateTime(o.resolution_due_at),
            ({ ok: 'No prazo', risk: 'Em risco', breached: 'Violado', paused: 'Pausado', stopped: 'Parado' } as Record<string, string>)[o.sla_state ?? ''] ?? '',
            o.evaluation_answered_at ? (o.evaluation_resolved === 'yes' ? `CSAT ${o.evaluation_csat} · CES ${o.evaluation_ces}` : 'não resolvido') : o.evaluation_sent ? 'aguardando' : '']));
        toast.success(`${rows.length} ocorrências exportadas.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível exportar.');
      } finally { setBusy(false); }
    }}><Download />{busy ? 'Exportando…' : 'Exportar'}</Button>
  );
}
