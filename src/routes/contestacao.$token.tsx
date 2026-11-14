import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { CheckCircle2 } from 'lucide-react';
import { atlasHead } from '@/lib/atlas-head';
import { getPublicContestation, submitContestation } from '@/lib/contestation.functions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PublicInvalid, PublicShell, formatPublicDate } from '@/components/atlas/public-shell';

const base = atlasHead('Contestação da análise', 'Conteste a análise de improcedência da sua ocorrência com a equipe Atlas.');
export const Route = createFileRoute('/contestacao/$token')({
  head: () => ({ ...base, meta: [...base.meta, { name: 'robots', content: 'noindex, nofollow' }, { name: 'referrer', content: 'no-referrer' }] }),
  loader: ({ params }) => getPublicContestation({ data: { token: params.token } }),
  errorComponent: () => <PublicShell><PublicInvalid /></PublicShell>,
  component: ContestationPage,
});

const decisions: Record<string, string> = { uphold: 'A análise de improcedência foi mantida após revisão.', reopen: 'A revisão reabriu a ocorrência para nova tratativa.' };

function ContestationPage() {
  const { token } = Route.useParams();
  const data = Route.useLoaderData();
  const submit = useServerFn(submitContestation);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  if (!data.valid) return <PublicShell><PublicInvalid message={data.message} /></PublicShell>;
  const o = data.occurrence;
  if (sent || data.submission) {
    return (
      <PublicShell>
        <section className="public-card" role="status">
          <CheckCircle2 className="public-icon" />
          <h1>Contestação registrada</h1>
          <p>{data.submission?.reviewed ? decisions[data.submission.decision ?? ''] ?? 'A contestação foi revisada.' : `Recebemos a sua contestação da ocorrência ${o.protocol}. O KAM da sua conta vai revisar a análise e responder por e-mail.`}</p>
        </section>
      </PublicShell>
    );
  }
  return (
    <PublicShell>
      <p className="eyebrow font-mono">{o.protocol}</p>
      <h1>Contestar a análise de improcedência</h1>
      <p className="page-subtitle">{o.subject}{o.closedAt ? ` · analisada em ${formatPublicDate(o.closedAt)}` : ''}</p>
      <section className="public-card">
        <h2>Justificativa da equipe</h2>
        <p className="prewrap">{o.justification ?? '—'}</p>
      </section>
      {data.canSubmit ? (
        <form className="public-form" noValidate onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          if (body.trim().length < 10) { setError('Descreva a contestação com pelo menos 10 caracteres.'); return; }
          setBusy(true);
          try { await submit({ data: { token, body: body.trim() } }); setSent(true); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível enviar. Tente novamente.'); } finally { setBusy(false); }
        }}>
          <section className="public-card">
            <label className="field" htmlFor="contestation-body">Por que a análise não está correta?<Textarea id="contestation-body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={4000} placeholder="Descreva os fatos e, se possível, cite pedidos, notas fiscais ou datas." /></label>
            <p className="field-hint">Prazo para contestar: até {formatPublicDate(data.expiresAt)}. A contestação é revisada pelo KAM ou pelo gestor de operações; ela não reabre a ocorrência automaticamente.</p>
          </section>
          {error && <p role="alert" className="form-error">{error}</p>}
          <Button className="public-submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar contestação'}</Button>
        </form>
      ) : <PublicInvalid />}
    </PublicShell>
  );
}
