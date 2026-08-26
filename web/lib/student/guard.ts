import type { SupabaseClient } from '@supabase/supabase-js'

/** True when the caller is a Student with a live record. The definer helper is
 *  the authority — it already excludes archived Students — so this asks it
 *  rather than re-deriving the rule in TypeScript. */
export async function isStudent(client: SupabaseClient): Promise<boolean> {
  const { data } = await client.rpc('app_current_student_id')
  return Boolean(data)
}
