import { queryOptions } from '@tanstack/react-query';
import { getProblem, listProblems, type problemFiltersSchema } from './problems.functions';
import type { z } from 'zod';

export type ProblemFilters = z.infer<typeof problemFiltersSchema>;
export const problemListOptions = (filters: ProblemFilters) => queryOptions({ queryKey: ['problems', filters], queryFn: () => listProblems({ data: filters }) });
export const problemDetailOptions = (id: string) => queryOptions({ queryKey: ['problem', id], queryFn: () => getProblem({ data: { id } }) });
