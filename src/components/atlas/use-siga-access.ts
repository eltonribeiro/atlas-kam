import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import type { AccessDecision } from '@/lib/siga-access';
import { getMyAccess } from '@/lib/siga-access.functions';

/** Acesso por tela da pessoa logada. Enquanto carrega, ou se a consulta falhar, `data` é indefinido e tudo fica fechado. */
export function useSigaAccess() {
  const getAccess = useServerFn(getMyAccess);
  const query = useQuery<AccessDecision>({ queryKey: ['siga-access'], staleTime: 60_000, refetchInterval: 60_000, refetchOnWindowFocus: 'always', retry: 1, queryFn: () => getAccess() });
  // Não reutilizar uma autorização antiga durante uma consulta ou depois de uma falha.
  return { ...query, data: query.isError || query.isFetching ? undefined : query.data };
}
