import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { atlasHead } from '@/lib/atlas-head';
import { answerEvaluation, getPublicEvaluation } from '@/lib/evaluation.functions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PublicInvalid, PublicShell, formatPublicDate } from '@/components/atlas/public-shell';

const base = atlasHead('Avaliação do atendimento', 'Avalie a solução da sua ocorrência com a equipe Atlas.');
export const Route = createFileRoute('/avaliacao/$token')({
  head: () => ({ ...base, meta: [...base.meta, { name: 'robots', content: 'noindex, nofollow' }, { name: 'referrer', content: 'no-referrer' }] }),
  loader: ({ params }) => getPublicEvaluation({ data: { token: params.token } }),
  errorComponent: () => <PublicShell><PublicInvalid /></PublicShell>,
  component: EvaluationPage,
});

type Resolved = 'yes' | 'partial' | 'no';

function EvaluationPage() {
  const { token } = Route.useParams();
  const data = Route.useLoaderData();
  const answer = useServerFn(answerEvaluation);
  const [resolved, setResolved] = useState<Resolved | ''>('');
  const [csat, setCsat] = useState(0);
  const [ces, setCes] = useState(0);
  const [missing, setMissing] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ reopened: boolean; due: string | null } | null>(null);

  if (!data.valid) return <PublicShell><PublicInvalid message={data.message} /></PublicShell>;

  const submit = async (reopen: boolean) => {
    setError('');
    if (!reopen) {
      if (!resolved) { setError('Informe se o problema foi resolvido.'); return; }
      if (resolved !== 'yes' && !missing.trim()) { setError('Conte o que ainda falta resolver.'); return; }
      if (!csat || !ces) { setError('Responda as duas perguntas de avaliação.'); return; }
    } else if (!missing.trim()) { setError('Conte o que voltou a acontecer.'); return; }
    setBusy(true);
    try {
      const r = await answer({ data: { token, resolved: reopen ? 'no' : (resolved as Resolved), csat: reopen ? 1 : csat, ces: reopen ? 1 : ces, missing, comment, reopen } });
      setResult({ reopened: r.status === 'reopened', due: r.resolutionDueAt });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <PublicShell>
        <section className="public-card" role="status">
          {result.reopened ? <RotateCcw className="public-icon" /> : <CheckCircle2 className="public-icon" />}
          <h1>{result.reopened ? 'Ocorrência reaberta' : 'Obrigado pela avaliação'}</h1>
          <p>{result.reopened ? `Sua ocorrência ${data.occurrence.protocol} voltou para tratativa${result.due ? `, com novo prazo de solução até ${formatPublicDate(result.due)}` : ''}. Você receberá as atualizações por e-mail.` : `Registramos sua avaliação. Se o problema voltar, você pode reabrir esta ocorrência pelo mesmo link em até 15 dias após o encerramento.`}</p>
        </section>
      </PublicShell>
    );
  }

  const o = data.occurrence;
  return (
    <PublicShell>
      <p className="eyebrow font-mono">{o.protocol}</p>
      <h1>{data.canAnswer ? 'Como foi a solução da sua ocorrência?' : 'O problema voltou a acontecer?'}</h1>
      <p className="page-subtitle">{o.subject} · aberta em {formatPublicDate(o.created_at)}</p>
      <section className="public-card">
        <h2>Você pediu</h2>
        <p className="prewrap">{o.customer_expectation}</p>
        <h2>Solução entregue{o.solution_proposed_at ? ` em ${formatPublicDate(o.solution_proposed_at)}` : ''}</h2>
        <p className="prewrap">{o.solution_text}</p>
      </section>
      {data.canAnswer ? (
        <form className="public-form" onSubmit={(e) => { e.preventDefault(); void submit(false); }} noValidate>
          <fieldset className="public-card">
            <legend>O seu problema foi resolvido?</legend>
            <div className="choice-row">{([['yes', 'Sim'], ['partial', 'Em parte'], ['no', 'Não']] as const).map(([v, label]) => <label key={v} className={`choice-pill ${resolved === v ? 'is-selected' : ''}`}><input type="radio" name="resolved" value={v} checked={resolved === v} onChange={() => setResolved(v)} />{label}</label>)}</div>
            {resolved && resolved !== 'yes' && <label className="field" htmlFor="missing">O que ainda falta resolver?<Textarea id="missing" maxLength={4000} value={missing} onChange={(e) => setMissing(e.target.value)} rows={4} /></label>}
            {resolved && resolved !== 'yes' && <p className="field-hint">Ao enviar, a ocorrência volta para tratativa com novo prazo.</p>}
          </fieldset>
          <Score label="Qual a sua satisfação com o atendimento desta ocorrência?" name="csat" max={5} value={csat} setValue={setCsat} low="1 · Muito insatisfeito" high="5 · Muito satisfeito" />
          <Score label="Foi fácil ter o seu problema resolvido?" name="ces" max={7} value={ces} setValue={setCes} low="1 · Muito fácil" high="7 · Muito difícil" />
          <label className="field" htmlFor="comment">Comentário (opcional)<Textarea id="comment" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} rows={3} /></label>
          {error && <p role="alert" className="form-error">{error}</p>}
          <Button className="public-submit" disabled={busy}>{busy ? 'Enviando…' : resolved && resolved !== 'yes' ? 'Enviar e reabrir ocorrência' : 'Enviar avaliação'}</Button>
        </form>
      ) : (
        <form className="public-form" onSubmit={(e) => { e.preventDefault(); void submit(true); }} noValidate>
          <section className="public-card">
            <p>Esta ocorrência foi encerrada em {formatPublicDate(o.closed_at)}. Se o problema voltou, você pode reabri-la até {formatPublicDate(data.reopenUntil)}.</p>
            <label className="field" htmlFor="reopen-missing">O que voltou a acontecer?<Textarea id="reopen-missing" value={missing} maxLength={4000} onChange={(e) => setMissing(e.target.value)} rows={4} /></label>
          </section>
          {error && <p role="alert" className="form-error">{error}</p>}
          <Button className="public-submit" disabled={busy}>{busy ? 'Enviando…' : 'O problema voltou: reabrir'}</Button>
        </form>
      )}
    </PublicShell>
  );
}

function Score({ label, name, max, value, setValue, low, high }: { label: string; name: string; max: number; value: number; setValue: (v: number) => void; low: string; high: string }) {
  return (
    <fieldset className="public-card">
      <legend>{label}</legend>
      <div className="score-row">{Array.from({ length: max }, (_, i) => i + 1).map((n) => <label key={n} className={`score-option ${value === n ? 'is-selected' : ''}`}><input type="radio" name={name} value={n} checked={value === n} onChange={() => setValue(n)} /><span>{n}</span></label>)}</div>
      <div className="score-ends"><span>{low}</span><span>{high}</span></div>
    </fieldset>
  );
}
