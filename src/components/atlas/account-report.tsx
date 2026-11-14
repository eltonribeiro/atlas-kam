import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAccountReport, getDashboard } from '@/lib/dashboard.functions';
import { catalogOptions } from '@/lib/occurrence-queries';
import { KpiGrid } from './kpi-grid';
import { CLOSED, ErrorState, LoadingState, PageHeading, SeverityBadge, StateBadge, downloadCsv, formatDate, formatDateTime, problemStatusLabels, statusLabels, todayInSaoPaulo, typeLabels } from './occurrence-ui';

function shift(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function AccountReport() {
  const { data: catalog } = useSuspenseQuery(catalogOptions);
  const today = todayInSaoPaulo();
  const [account, setAccount] = useState(catalog.accounts[0]?.id ?? '');
  const [from, setFrom] = useState(shift(today, -89));
  const [to, setTo] = useState(today);
  const dashboard = useServerFn(getDashboard);
  const report = useServerFn(getAccountReport);
  const valid = Boolean(account) && from <= to;
  const kpis = useQuery({ queryKey: ['report-kpis', account, from, to], enabled: valid, queryFn: () => dashboard({ data: { from, to, accountId: account } }) });
  const rows = useQuery({ queryKey: ['report-rows', account, from, to], enabled: valid, queryFn: () => report({ data: { from, to, accountId: account } }) });
  const name = catalog.accounts.find((a) => a.id === account)?.name ?? '';
  const occ = rows.data?.occurrences ?? [];
  const complaints = occ.filter((o) => o.type !== 'request');
  return (
    <main className="atlas-main report-page">
      <PageHeading eyebrow="RELATÓRIOS" title="Relatório da conta" subtitle="Resumo para a reunião de conta: indicadores do período, causas recorrentes, problemas e ocorrências." actions={<><Button variant="outline" disabled={!occ.length} onClick={() => downloadCsv(`atlas-relatorio-${name.toLowerCase().replace(/\s+/g, '-')}-${from}-a-${to}.csv`, ['Protocolo', 'Aberta em', 'Tipo', 'Categoria', 'Assunto', 'Severidade', 'Status', '1ª resposta no prazo', 'Solução no prazo', 'Avaliação'], occ.map((o) => [o.protocol, formatDateTime(o.created_at), typeLabels[o.type ?? ''] ?? '', o.category_name, o.subject, o.severity, statusLabels[o.status ?? ''] ?? '', o.first_response_at ? (o.first_response_breached ? 'Não' : 'Sim') : '—', CLOSED.includes(o.status ?? '') || o.status === 'solution_proposed' ? (o.resolution_breached ? 'Não' : 'Sim') : '—', o.evaluation_answered_at ? `${o.evaluation_resolved === 'yes' ? 'Resolvido' : 'Não resolvido'} · CSAT ${o.evaluation_csat} · CES ${o.evaluation_ces}` : '']))}><Download />Exportar</Button><Button variant="outline" onClick={() => window.print()}><Printer />Imprimir</Button></>} />
      <div className="filter-row no-print">
        <label className="select-field">Conta<select value={account} onChange={(e) => setAccount(e.target.value)}>{catalog.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label className="select-field">De<Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="select-field">Até<Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></label>
        {[30, 90, 180, 365].map((d) => <Button key={d} size="sm" variant="ghost" onClick={() => { setTo(today); setFrom(shift(today, -(d - 1))); }}>{d === 365 ? '12 meses' : `${d} dias`}</Button>)}
      </div>
      {!catalog.accounts.length ? <p className="empty-row">Nenhuma conta liberada para o seu perfil.</p> : !valid ? <p className="form-error">A data inicial deve ser anterior à final.</p> : (
        <>
          <p className="print-only report-title">{name} · {formatDate(from)} a {formatDate(to)}</p>
          {kpis.error ? <ErrorState error={kpis.error} retry={() => void kpis.refetch()} /> : !kpis.data ? <LoadingState label="Calculando indicadores…" /> : <KpiGrid current={kpis.data.current} previous={kpis.data.previous} />}
          <div className="chart-columns">
            <section className="panel-card">
              <h2>Resumo do período</h2>
              {!rows.data ? <LoadingState /> : (
                <dl className="inline-dl">
                  <dt>Ocorrências abertas no período</dt><dd className="font-mono">{occ.length}</dd>
                  <dt>Reclamações e incidentes</dt><dd className="font-mono">{complaints.length}</dd>
                  <dt>S1 e S2</dt><dd className="font-mono">{occ.filter((o) => o.severity === 'S1' || o.severity === 'S2').length}</dd>
                  <dt>Ainda em aberto</dt><dd className="font-mono">{occ.filter((o) => !CLOSED.includes(o.status ?? '')).length}</dd>
                  <dt>Reabertas</dt><dd className="font-mono">{occ.filter((o) => (o.reopen_count ?? 0) > 0).length}</dd>
                </dl>
              )}
            </section>
            <section className="panel-card">
              <h2>Causas recorrentes · Pareto 90 dias</h2>
              {!kpis.data ? <LoadingState /> : !kpis.data.pareto.items.length ? <p className="text-muted-foreground">Sem reclamações nos últimos 90 dias.</p> : <ul className="bar-list">{kpis.data.pareto.items.map((i) => <li key={i.label}><div className="bar-label"><span>{i.label}</span><span className="font-mono">{i.count} · {i.percent.toLocaleString('pt-BR')}%</span></div><div className="bar-track" aria-hidden="true"><span style={{ width: `${i.percent}%` }} /></div></li>)}</ul>}
            </section>
          </div>
          <section className="work-section">
            <h2>Problemas da conta</h2>
            {rows.error ? <ErrorState error={rows.error} retry={() => void rows.refetch()} /> : !rows.data ? <LoadingState /> : rows.data.problems.length ? (
              <div className="table-scroll"><table className="atlas-table"><thead><tr><th>Código</th><th>Problema</th><th>Status</th><th>Ocorrências</th><th>Ações</th><th>Eficácia</th></tr></thead><tbody>{rows.data.problems.map((p) => <tr key={p.id ?? ''}><td><Link className="protocol-link" to="/problemas/$id" params={{ id: p.id ?? '' }}>{p.code}</Link></td><td>{p.title}</td><td>{problemStatusLabels[p.status ?? '']}</td><td className="font-mono">{p.occurrence_count}</td><td className="font-mono">{p.actions_done}/{p.actions_total}</td><td>{p.effectiveness_effective ? 'Efetiva' : p.effectiveness_due_date ? `verificar ${formatDate(p.effectiveness_due_date)}` : '—'}</td></tr>)}</tbody></table></div>
            ) : <p className="empty-row">Nenhum problema registrado para esta conta.</p>}
          </section>
          <section className="work-section">
            <h2>Ocorrências do período · {occ.length}</h2>
            {!rows.data ? <LoadingState /> : occ.length ? (
              <div className="table-scroll"><table className="atlas-table"><thead><tr><th>Nº</th><th>Aberta em</th><th>Assunto</th><th>Sev.</th><th>Status</th><th>Avaliação</th></tr></thead><tbody>{occ.map((o) => <tr key={o.id ?? ''}><td><Link className="protocol-link" to="/ocorrencias/$id" params={{ id: o.id ?? '' }}>{o.protocol}</Link></td><td className="font-mono">{formatDate(o.created_at)}</td><td><strong>{o.subject}</strong><span className="table-secondary">{o.category_name} · {typeLabels[o.type ?? '']}</span></td><td><SeverityBadge severity={o.severity ?? 'S4'} /></td><td><StateBadge status={o.status ?? ''} /></td><td>{o.evaluation_answered_at ? (o.evaluation_resolved === 'yes' ? `CSAT ${o.evaluation_csat} · CES ${o.evaluation_ces}` : 'não resolvido') : '—'}</td></tr>)}</tbody></table></div>
            ) : <p className="empty-row">Nenhuma ocorrência aberta no período.</p>}
          </section>
        </>
      )}
    </main>
  );
}
