import type { SupabaseClient } from '@supabase/supabase-js'

/** The Academic Year of Test School A's seeded "Seed Class - A" Class Offering
 *  (supabase/seed-test.sql). The seed inserts it with no explicit year, so it
 *  takes the `class_offerings.academic_year` column default
 *  (`extract(year from now())`, migration 0185) -- which rolls over on Jan 1.
 *  A `target_scope='broadcast'` publication aimed at the seeded Student must
 *  pin this exact year (the broadcast predicate matches on Academic Year), so
 *  fixtures resolve it live rather than hardcoding a literal that goes stale. */
export async function seedClassYear(admin: SupabaseClient): Promise<number> {
  const { data } = await admin
    .from('class_offerings')
    .select('academic_year')
    .eq('name', 'Seed Class')
    .eq('section', 'A')
    .maybeSingle()
  return (data?.academic_year as number | undefined) ?? new Date().getFullYear()
}
