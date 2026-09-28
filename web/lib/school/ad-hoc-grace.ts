import type { SupabaseClient } from '@supabase/supabase-js'

/** Employee Categories an Ad-Hoc Grace Exemption applies to, keyed by the
 *  exemption's own id (issue #671) — the shared "fetch categories for a set
 *  of exemption ids" step behind both the Grace Time list (which groups by
 *  exemption for display) and the Employee Attendance page's grace
 *  calculation (which regroups the same rows by category), so a future
 *  change to this join table has one call site to update, not two. */
export async function exemptionCategoriesByExemptionId(
  supabase: SupabaseClient,
  exemptionIds: readonly string[],
): Promise<Map<string, string[]>> {
  if (!exemptionIds.length) return new Map()
  const { data } = await supabase
    .from('ad_hoc_grace_exemption_categories')
    .select('exemption_id, category')
    .in('exemption_id', exemptionIds)
  const map = new Map<string, string[]>()
  for (const row of data ?? []) {
    const list = map.get(row.exemption_id) ?? []
    list.push(row.category)
    map.set(row.exemption_id, list)
  }
  return map
}
