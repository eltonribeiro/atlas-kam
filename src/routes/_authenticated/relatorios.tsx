import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { catalogOptions } from '@/lib/occurrence-queries';
import { AccountReport } from '@/components/atlas/account-report';
import { ErrorState, LoadingState } from '@/components/atlas/occurrence-ui';

export const Route = createFileRoute('/_authenticated/relatorios')({
  head: () => atlasHead('Relatórios', 'Relatório por conta com indicadores, causas recorrentes, problemas e ocorrências do período no Atlas KAM.'),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogOptions),
  pendingComponent: () => <main className="atlas-main"><LoadingState label="Carregando…" /></main>,
  errorComponent: ({ error, reset }) => <main className="atlas-main"><ErrorState error={error} retry={reset} /></main>,
  component: AccountReport,
});
