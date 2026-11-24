import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import type { AccessDecision } from '@/lib/siga-access';
import { getMyAccess } from '@/lib/siga-access.functions';

/** Acesso por tela da pessoa logada. Sem decisão inicial ou após falha, tudo fica fechado; a renovação preserva a última decisão. */
export function useSigaAccess() {
  const getAccess = useServerFn(getMyAccess);
  const query = useQuery<AccessDecision>({ queryKey: ['siga-access'], staleTime: 60_000, refetchInterval: 60_000, refetchOnWindowFocus: 'always', retry: 1, queryFn: () => getAccess() });
  // Preservar a tela durante a renovação; não reutilizar a decisão depois de uma falha.
  return { ...query, data: query.isError ? undefined : query.data };
}
