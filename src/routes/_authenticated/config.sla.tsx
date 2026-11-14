import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { SlaConfig, slaConfigOptions } from '@/components/atlas/config/sla-config';
import { ErrorState, LoadingState } from '@/components/atlas/occurrence-ui';

export const Route = createFileRoute('/_authenticated/config/sla')({
  head: () => atlasHead('Contratos e SLA', 'Políticas de prazo por severidade, calendários úteis, feriados e categorias do Atlas KAM.'),
  loader: ({ context }) => context.queryClient.ensureQueryData(slaConfigOptions),
  pendingComponent: () => <main className="atlas-main"><LoadingState label="Carregando a configuração…" /></main>,
  errorComponent: ({ error, reset }) => <main className="atlas-main"><ErrorState error={error} retry={reset} /></main>,
  component: SlaConfig,
});
