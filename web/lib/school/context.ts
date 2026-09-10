import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { globalShiftSelection, globalAcademicYearSelection } from '@/lib/ui-prefs-server'
import type { Role } from '@/lib/auth/routing'
import type { SupabaseClient } from '@supabase/supabase-js'

// Per-request memoized auth + profile + grants + school for the /school/* group.
// Wrapped in React cache() so the layout AND the page (and any server component in
// the tree) resolve the SAME auth.getUser() + profiles + school queries once per
// request instead of each re-running the waterfall. This removes the duplicated
// getUser/profile round-trips that dominated deployed (serverless) latency.

export interface SchoolContext {
  supabase: SupabaseClient
  userId: string
  email: string
  role: Role
  fullName: string
  schoolId: string
  schoolName: string | null
  subscriptionExpiresAt: string | null
  /** trial | active | expired, computed on read by school_subscription_status. */
  subscriptionStatus: string | null
  grants: readonly string[]
  /** Shift (issue #576/#577, Wave 5/#590) — read here, not re-fetched per
   *  page, since every /school/* page already shares this one cached
   *  schools-row query. configuredShifts empty means No Shift; shiftSelection
   *  is already reconciled against it (#577's parseShiftSelection). */
  configuredShifts: readonly string[]
  shiftSelection: readonly string[]
  /** schools.active_academic_year (#570/#594) — the year new Class Offerings
   *  are stamped with, and the year list/report screens default their view to.
   *  Read here (the shared schools-row query) so pages needn't re-fetch it.
   *  null only for a School whose row predates the column's default. */
  activeAcademicYear: number | null
  /** Academic Years this School has actually *started* (school_academic_years,
   *  #609/#610), newest first. Read here alongside the schools row so browse
   *  screens needn't re-fetch it. Empty only for a School with no history row
   *  yet (pre-backfill). */
  startedAcademicYears: readonly number[]
  /** The effective Global Academic Year Selection (#609) — a per-user cookie
   *  view preference, already reconciled against startedAcademicYears and
   *  guaranteed to include activeAcademicYear when that is non-null. Browse
   *  Offering lists narrow to this; compose/targeting surfaces never read it. */
  academicYearSelection: readonly number[]
}

export const getSchoolContext = cache(async (): Promise<SchoolContext> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, school_id')
    .eq('id', user.id)
    .single()
  if (!profile || (profile.role !== 'school_owner' && profile.role !== 'staff_user')) redirect('/login')
  const role = profile.role as Role

  // School, grants and subscription status are independent → fetch in parallel,
  // not in a waterfall. Status lives here (inside the cached seam) so the layout
  // gate (#169) and any page share the single round-trip.
  const [{ data: school }, grantsRes, { data: status }, { data: startedYearRows }] = await Promise.all([
    supabase
      .from('schools')
      .select('name, subscription_expires_at, configured_shifts, active_academic_year')
      .eq('id', profile.school_id)
      .maybeSingle(),
    role === 'staff_user'
      ? supabase.from('staff_permissions').select('screen_key').eq('staff_user_id', user.id)
      : Promise.resolve({ data: [] as { screen_key: string }[] }),
    supabase.rpc('school_subscription_status', { sid: profile.school_id }),
    supabase
      .from('school_academic_years')
      .select('academic_year')
      .eq('school_id', profile.school_id)
      .order('academic_year', { ascending: false }),
  ])
  const configuredShifts = school?.configured_shifts ?? []
  const activeAcademicYear = (school?.active_academic_year ?? null) as number | null
  const startedAcademicYears = (startedYearRows ?? []).map((r) => r.academic_year as number)

  return {
    supabase,
    userId: user.id,
    email: user.email ?? '',
    role,
    fullName: profile.full_name ?? user.email ?? '',
    schoolId: profile.school_id,
    schoolName: school?.name ?? null,
    subscriptionExpiresAt: school?.subscription_expires_at ?? null,
    subscriptionStatus: (status as string | null) ?? null,
    grants: (grantsRes.data ?? []).map((p) => p.screen_key),
    configuredShifts,
    shiftSelection: await globalShiftSelection(configuredShifts),
    activeAcademicYear,
    startedAcademicYears,
    academicYearSelection: await globalAcademicYearSelection(startedAcademicYears, activeAcademicYear),
  }
})
