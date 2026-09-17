'use server'

import { createClient } from '@/lib/supabase/server'

export interface RecentAdmissionRow {
  id: string
  full_name: string
  roll_number: number | null
  class_name: string | null
  section: string | null
  guardian_name: string | null
  /** Current Enrollment's Class Offering (issue #640), joined the same way
   *  roster-source.ts's ROSTER_COLUMNS is — so the Class cell can render the
   *  full Class Catalogue label instead of the legacy class_name/section
   *  bridge above. Null for a row with no current enrollment; the caller
   *  falls back to class_name/section in that case. */
  student_enrollments: {
    class_offerings: {
      name: string
      section: string | null
      group_department: string | null
      shift: string | null
      academic_year: number | null
    }[]
  }[]
}

/** The last 10 admitted students, newest first — backs the New Admission
 *  page's Recent Admissions list (issue #625). Deliberately NOT `schoolRoster`:
 *  that query always narrows by the Global Academic Year/Shift Selection,
 *  which this list must not — it's "what did this school just admit",
 *  unfiltered, not a browse view (same "no class dimension" shape as the
 *  topbar's own recent-activity feed, app/api/school/recent-activity/route.ts).
 *  Called both server-side (initial page load) and again from the client
 *  after each save, so the list is never a session-local echo — it's always
 *  the real last 10 in the database.
 *
 *  Kept in its own file, not actions.ts, so the Global Shift Filtering guard
 *  (tests/unit/shift-filter-required.test.ts) can exempt this one read by
 *  file path without blanket-exempting actions.ts's other ten `students`
 *  reads too. */
export async function recentAdmissions(): Promise<RecentAdmissionRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('students')
    .select(
      `id, full_name, roll_number, class_name, section, guardian_name,
      student_enrollments!students_current_enrollment_id_fkey(class_offerings(name, section, group_department, shift, academic_year))`,
    )
    .is('archived_at', null)
    // id as tiebreaker: created_at alone can collide (bulk import, or two
    // admits within the same millisecond) and would otherwise let the same
    // "last 10" reshuffle between calls with no new admission to explain it.
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(10)
  return data ?? []
}
