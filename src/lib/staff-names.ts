import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

/** Display names of internal staff (no e-mails), resolved through a role-checked database function. */
export async function staffNames(supabase: SupabaseClient<Database>, ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))].slice(0, 200);
  if (!unique.length) return {};
  const r = await supabase.rpc('staff_names', { p_ids: unique });
  if (r.error || !r.data || typeof r.data !== 'object' || Array.isArray(r.data)) return {};
  return r.data as Record<string, string>;
}
