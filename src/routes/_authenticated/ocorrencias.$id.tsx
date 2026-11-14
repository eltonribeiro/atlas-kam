import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { detailOptions } from '@/lib/occurrence-queries';
import { OccurrenceDetail } from '@/components/atlas/occurrence-detail';
import { ErrorState, LoadingState } from '@/components/atlas/occurrence-ui';

export const Route = createFileRoute('/_authenticated/ocorrencias/$id')({
  head: () => atlasHead('Tratativa da ocorrência', 'Status, prazos de SLA, análise de causa, plano de ação e histórico da ocorrência no Atlas KAM.'),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(detailOptions(params.id)),
  pendingComponent: () => <main className="atlas-main"><LoadingState label="Carregando a tratativa…" /></main>,
  errorComponent: ({ error, reset }) => <main className="atlas-main"><ErrorState error={error} retry={reset} /></main>,
  component: Detail,
});
function Detail() {
  const { id } = Route.useParams();
  return <OccurrenceDetail id={id} />;
}
