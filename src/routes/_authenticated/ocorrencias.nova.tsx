import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { catalogOptions } from '@/lib/occurrence-queries';
import { OccurrenceForm } from '@/components/atlas/occurrence-form';
import { ErrorState, LoadingState } from '@/components/atlas/occurrence-ui';

export const Route = createFileRoute('/_authenticated/ocorrencias/nova')({
  head: () => atlasHead('Nova ocorrência', 'Registro de reclamação de conta-chave com protocolo e prazos contratuais no Atlas KAM.'),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogOptions),
  pendingComponent: () => <main className="atlas-main"><LoadingState label="Carregando cadastros…" /></main>,
  errorComponent: ({ error, reset }) => <main className="atlas-main"><ErrorState error={error} retry={reset} /></main>,
  component: OccurrenceForm,
});
