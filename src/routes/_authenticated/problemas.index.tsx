import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { problemFiltersSchema } from '@/lib/problems.functions';
import { problemListOptions } from '@/lib/problem-queries';
import { ProblemList } from '@/components/atlas/problems/problem-list';
import { ErrorState } from '@/components/atlas/occurrence-ui';

export const Route = createFileRoute('/_authenticated/problemas/')({
  validateSearch: problemFiltersSchema,
  head: () => atlasHead('Problemas (RCA)', 'Problemas recorrentes com análise de causa raiz, plano de ação e verificação de eficácia no Atlas KAM.'),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => { void context.queryClient.prefetchQuery(problemListOptions(deps)); },
  errorComponent: ({ error, reset }) => <main className="atlas-main"><ErrorState error={error} retry={reset} /></main>,
  component: ProblemList,
});
