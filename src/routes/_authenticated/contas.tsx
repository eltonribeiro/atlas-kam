import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { AccountsAdmin, accountsOverviewOptions } from '@/components/atlas/config/accounts-admin';
import { ErrorState, LoadingState } from '@/components/atlas/occurrence-ui';

export const Route = createFileRoute('/_authenticated/contas')({
  head: () => atlasHead('Contas', 'Contas-chave, contatos autorizados, equipe alocada e perfis de acesso no Atlas KAM.'),
  loader: ({ context }) => context.queryClient.ensureQueryData(accountsOverviewOptions),
  pendingComponent: () => <main className="atlas-main"><LoadingState label="Carregando as contas…" /></main>,
  errorComponent: ({ error, reset }) => <main className="atlas-main"><ErrorState error={error} retry={reset} /></main>,
  component: AccountsAdmin,
});
