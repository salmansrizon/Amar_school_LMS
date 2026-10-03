import { getSchoolContext } from '@/lib/school/context'
import { schoolRoster } from '@/lib/school/roster-source'
import { monthlyFeeStandings } from '@/lib/school/fee-standing-source'
import { schoolToday } from '@/lib/school-time'
import type { FeeStanding } from '@/lib/fees'
import { isIncompleteProfile, type RosterStudent } from '@/lib/school/roster'

// The Student directory's filtered rows — one definition shared by the list,
// bulk ID-card print and CSV export, so all three always agree.

export type DirectoryParams = { q?: string; classSection?: string; fee?: string; admitted?: string; incomplete?: string }

export const isFeeStanding = (v: string | undefined): v is FeeStanding =>
  v === 'paid' || v === 'partial' || v === 'due'

export async function loadDirectoryRows({ q = '', classSection = '', fee, admitted, incomplete }: DirectoryParams) {
  const { supabase, shiftSelection, startedAcademicYears, academicYearSelection } = await getSchoolContext()
  const showYear = startedAcademicYears.length > 1
  const today = schoolToday()
  const [year, month] = today.split('-').map(Number)
  const monthPrefix = today.slice(0, 7)
  const [roster, fees] = await Promise.all([
    schoolRoster(supabase, { classSection, q, shiftSelection, showYear, academicYearSelection }),
    monthlyFeeStandings(supabase, month, year),
  ])
  const admittedThisMonth = (s: RosterStudent) => s.created_at?.startsWith(monthPrefix) ?? false
  const rows = roster.students.filter(
    (s) =>
      (!isFeeStanding(fee) || fees.get(s.id)?.standing === fee) &&
      (admitted !== 'month' || admittedThisMonth(s)) &&
      // The stat card counts this-month admissions with no guardian mobile.
      (incomplete !== '1' || (admittedThisMonth(s) && isIncompleteProfile(s))),
  )
  return { roster, fees, rows, showYear, admittedThisMonth }
}
