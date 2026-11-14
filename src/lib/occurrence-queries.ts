import { queryOptions } from '@tanstack/react-query';
import { getOccurrenceCatalog, getOccurrence, listOccurrences } from './occurrences.functions';
import { getDashboard } from './dashboard.functions';
import { periodRange, type OccurrenceFilters } from './occurrence-filters';

export const catalogOptions = queryOptions({ queryKey: ['occurrence-catalog'], queryFn: () => getOccurrenceCatalog(), staleTime: 5 * 60000 });

export function listFilters(search: OccurrenceFilters) {
  const { period: _period, ...rest } = search;
  return rest;
}
export const occurrenceListOptions = (search: OccurrenceFilters) =>
  queryOptions({ queryKey: ['occurrences', listFilters(search)], queryFn: () => listOccurrences({ data: listFilters(search) }) });

export const dashboardOptions = (period: OccurrenceFilters['period'], accountId?: string) => {
  const range = periodRange(period);
  return queryOptions({ queryKey: ['dashboard', range.from, range.to, accountId ?? null], queryFn: () => getDashboard({ data: { from: range.from, to: range.to, accountId: accountId ?? null } }), staleTime: 60000 });
};

export const detailOptions = (id: string) => queryOptions({ queryKey: ['occurrence', id], queryFn: () => getOccurrence({ data: { id } }) });
