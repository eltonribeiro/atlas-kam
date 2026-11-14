import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { occurrenceFiltersSchema } from '@/lib/occurrence-filters';
import { catalogOptions, dashboardOptions, occurrenceListOptions } from '@/lib/occurrence-queries';
import { OccurrenceDashboard, TableSkeleton } from '@/components/atlas/occurrence-list';
import { ErrorState } from '@/components/atlas/occurrence-ui';

export const Route = createFileRoute('/_authenticated/ocorrencias/')({
  validateSearch: occurrenceFiltersSchema,
  head: () => atlasHead('Ocorrências', 'Indicadores, prazos de SLA e lista de ocorrências das contas-chave no Atlas KAM.'),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(catalogOptions),
      context.queryClient.ensureQueryData(occurrenceListOptions(deps)),
      context.queryClient.prefetchQuery(dashboardOptions(deps.period, deps.account)),
    ]);
  },
  pendingComponent: () => <main className="atlas-main"><div className="kpi-grid">{Array.from({ length: 8 }, (_, i) => <div key={i} className="kpi-card skeleton-card" />)}</div><TableSkeleton /></main>,
  errorComponent: ({ error, reset }) => <main className="atlas-main"><ErrorState error={error} retry={reset} /></main>,
  component: OccurrenceDashboard,
});
