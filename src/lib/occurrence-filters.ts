import { z } from 'zod';

export const CLOSED_STATUSES = ['closed_resolved', 'closed_no_evaluation', 'closed_unfounded'] as const;
export const PAGE_SIZE = 25;

/** Filters of the occurrence list, kept in the URL so they survive reloads and can be shared. */
export const occurrenceFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  account: z.string().uuid().optional().catch(undefined),
  status: z.enum(['open', 'closed', 'all']).optional().catch(undefined),
  severity: z.enum(['S1', 'S2', 'S3', 'S4']).optional().catch(undefined),
  category: z.string().uuid().optional().catch(undefined),
  risk: z.boolean().optional().catch(undefined),
  page: z.number().int().min(1).max(10000).optional().catch(undefined),
  period: z.enum(['7', '30', '90', '365']).optional().catch(undefined),
});
export type OccurrenceFilters = z.infer<typeof occurrenceFiltersSchema>;

export function sanitizeSearch(value: string | undefined) {
  return (value ?? '').replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function periodRange(period: OccurrenceFilters['period'], now = new Date()) {
  const days = Number(period ?? '30');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const end = new Date(`${today}T12:00:00Z`);
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  return { from: start.toISOString().slice(0, 10), to: today, days };
}
