import { AlertTriangle } from 'lucide-react';
import type { KpiWindow } from '@/lib/dashboard.functions';
import { formatMinutes } from './occurrence-ui';

const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const dec = (v: number | null, digits = 1) => (v === null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }));

type Kpi = {
  key: string;
  label: string;
  value: string;
  definition: string;
  delta: { text: string; better: boolean | null } | null;
  sample: string;
  extra?: string | undefined;
  warning?: string | undefined;
};

function delta(current: number | null, previous: number | null, higherIsBetter: boolean, format: (d: number) => string): Kpi['delta'] {
  if (current === null || previous === null) return null;
  const d = Math.round((current - previous) * 10) / 10;
  if (d === 0) return { text: 'sem variação', better: null };
  return { text: `${d > 0 ? '+' : '−'}${format(Math.abs(d))}`, better: higherIsBetter ? d > 0 : d < 0 };
}

export function buildKpis(c: KpiWindow, p: KpiWindow): Kpi[] {
  const lowResponse = c.response_rate !== null && c.response_rate < 30;
  const pp = (d: number) => `${d.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.`;
  return [
    { key: 'resolution', label: 'Índice de solução', value: pct(c.resolution_index), definition: 'Encerradas avaliadas “Sim” ÷ encerradas com avaliação do cliente.', delta: delta(c.resolution_index, p.resolution_index, true, pp), sample: `${c.resolution_index_n} avaliações` },
    { key: 'fr_sla', label: 'SLA de 1ª resposta', value: pct(c.first_response_sla), definition: '1ª respostas dentro do prazo ÷ 1ª respostas do período.', delta: delta(c.first_response_sla, p.first_response_sla, true, pp), sample: `${c.first_response_n} respostas` },
    { key: 'sol_sla', label: 'SLA de solução', value: pct(c.solution_sla), definition: 'Soluções propostas no prazo ÷ soluções propostas; violação em qualquer ciclo conta.', delta: delta(c.solution_sla, p.solution_sla, true, pp), sample: `${c.solution_n} soluções` },
    { key: 'fr_time', label: 'Tempo médio de 1ª resposta', value: formatMinutes(c.first_response_avg_minutes), definition: 'Média de horas úteis entre a abertura e a 1ª resposta.', delta: delta(c.first_response_avg_minutes, p.first_response_avg_minutes, false, (d) => formatMinutes(d)), sample: `${c.first_response_n} respostas` },
    { key: 'sol_time', label: 'Tempo médio de solução', value: c.solution_avg_days === null ? '—' : `${dec(c.solution_avg_days)} d`, definition: 'Média de dias úteis da abertura à 1ª solução, sem pausas.', delta: delta(c.solution_avg_days, p.solution_avg_days, false, (d) => `${dec(d)} d`), sample: `${c.solution_n} soluções` },
    { key: 'csat', label: 'CSAT da tratativa', value: c.csat === null ? '—' : `${dec(c.csat)} / 5`, definition: 'Média da satisfação nas avaliações respondidas.', delta: delta(c.csat, p.csat, true, (d) => dec(d)), sample: `taxa de resposta ${pct(c.response_rate)}`, extra: `CES ${c.ces === null ? '—' : `${dec(c.ces)} / 7`} · esforço, menor é melhor`, warning: lowResponse ? 'Baixa confiabilidade: menos de 30% de resposta.' : undefined },
    { key: 'response', label: 'Taxa de resposta da pesquisa', value: pct(c.response_rate), definition: 'Avaliações respondidas ÷ avaliações enviadas no período.', delta: delta(c.response_rate, p.response_rate, true, pp), sample: `${c.surveys_answered} de ${c.surveys_sent} pesquisas`, warning: lowResponse ? 'Abaixo de 30%: resultados com baixa confiabilidade.' : undefined },
    { key: 'reopen', label: 'Taxa de reabertura', value: pct(c.reopen_rate), definition: 'Encerradas reabertas em até 15 dias ÷ encerradas no período.', delta: delta(c.reopen_rate, p.reopen_rate, false, pp), sample: `${c.reopened_n} de ${c.closures_n} encerradas` },
  ];
}

export function KpiGrid({ current, previous }: { current: KpiWindow; previous: KpiWindow }) {
  const kpis = buildKpis(current, previous);
  return (
    <div className="kpi-grid">
      {kpis.map((k) => (
        <article key={k.key} className="kpi-card">
          <p className="kpi-label">{k.label}</p>
          <p className="kpi-value font-mono">{k.value}</p>
          <p className={`kpi-delta ${k.delta?.better === true ? 'delta-better' : k.delta?.better === false ? 'delta-worse' : ''}`}>
            {k.delta ? <>{k.delta.text}{k.delta.better === null ? '' : k.delta.better ? ' · melhorou' : ' · piorou'}</> : 'sem base no período anterior'}
          </p>
          {k.extra && <p className="kpi-extra">{k.extra}</p>}
          {k.warning && <p className="kpi-warning"><AlertTriangle size={13} aria-hidden="true" />{k.warning}</p>}
          <p className="kpi-definition">{k.definition}</p>
          <p className="kpi-sample font-mono">{k.sample}</p>
        </article>
      ))}
    </div>
  );
}
