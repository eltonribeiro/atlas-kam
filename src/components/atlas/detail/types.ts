import type { getOccurrence } from '@/lib/occurrences.functions';

export type OccurrenceDetailData = NonNullable<Awaited<ReturnType<typeof getOccurrence>>>;
export type Transition = { action: string; label: string; allowed: boolean; conditions: { label: string; met: boolean }[] };

export function transitionsOf(v: unknown): Transition[] {
  if (!Array.isArray(v)) return [];
  return v.filter((t): t is Transition => t !== null && typeof t === 'object' && 'action' in t && 'allowed' in t).map((t) => ({ ...t, conditions: Array.isArray(t.conditions) ? t.conditions : [] }));
}

/** Mirrors the database permission for editing analysis and plan; the database still enforces it. */
export function canWorkOn(d: OccurrenceDetailData) {
  const closed = ['closed_resolved', 'closed_no_evaluation', 'closed_unfounded'].includes(d.occurrence.status);
  if (closed) return false;
  return d.role === 'kam' || d.role === 'ops_manager' || (d.role === 'analyst' && d.occurrence.assignee_id === d.userId);
}
export function isManager(d: OccurrenceDetailData) {
  return d.role === 'kam' || d.role === 'ops_manager';
}
