import type { SupabaseClient } from '@supabase/supabase-js'
import type { LocationRow } from '@/lib/locations'

// The Bangladesh location seed (#116-#118) put this table past Supabase's
// default 1000-row REST cap, so a single unbounded `.select()` silently
// truncates it. Page through it in batches instead — shared by every page
// that needs the full tree (super-admin/locations, super-admin/clusters).
const FETCH_PAGE_SIZE = 1000

export async function fetchAllLocations(supabase: SupabaseClient): Promise<LocationRow[]> {
  const rows: LocationRow[] = []
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data } = await supabase
      .from('locations')
      .select('id, name, type, parent_id')
      .order('name')
      .range(from, from + FETCH_PAGE_SIZE - 1)
    if (!data || data.length === 0) break
    rows.push(...(data as LocationRow[]))
    if (data.length < FETCH_PAGE_SIZE) break
  }
  return rows
}
