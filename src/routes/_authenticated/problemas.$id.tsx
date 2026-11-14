import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { problemDetailOptions } from '@/lib/problem-queries';
import { ProblemDetail } from '@/components/atlas/problems/problem-detail';
import { ErrorState, LoadingState } from '@/components/atlas/occurrence-ui';

export const Route = createFileRoute('/_authenticated/problemas/$id')({
  head: () => atlasHead('Detalhe do problema', 'Causa raiz, plano de ação, ocorrências vinculadas e verificação de eficácia no Atlas KAM.'),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(problemDetailOptions(params.id)),
  pendingComponent: () => <main className="atlas-main"><LoadingState label="Carregando o problema…" /></main>,
  errorComponent: ({ error, reset }) => <main className="atlas-main"><ErrorState error={error} retry={reset} /></main>,
  component: Detail,
});
function Detail() {
  const { id } = Route.useParams();
  return <ProblemDetail id={id} />;
}
