// Office Hour (issue #643, ADR 0026): a published Employee-Category x Shift x
// Day-of-week expected time window, configured under Institute Setup. Kept
// pure for unit testing, matching the Class Routine grid's own lib/routine.ts
// shape (indexSlots -> groupOfficeHoursByCategory) but with an unrelated
// table (category_office_hours) and axes swapped: rows=Employee Category,
// columns=Day, one Shift's data visible at a time -- see ADR 0026 for why
// this is not an extension of office_times.

import { ACADEMIC_SHIFTS, type AcademicShift } from '@/lib/institute'

// Sunday..Saturday, all 7 -- unlike Class Routine's Sun-Thu-only ROUTINE_DAYS
// (lib/routine.ts), Office Hour's requirement is explicitly the full week.
export const OFFICE_HOUR_DAYS = [0, 1, 2, 3, 4, 5, 6] as const

/** "08:00:00" / "08:00" -> "8:00 AM". The only existing time-formatting
 *  precedent in this codebase (exam routine) shows raw 24h and has no AM/PM
 *  logic to reuse, so this is new. */
export function formatTime12h(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

/** Mirrors the DB's `category_office_hours_time_order` CHECK (end > start) as
 *  a client-side check, so the form can reject before a round trip. */
export function validateOfficeHourTimeRange(start: string, end: string): string | null {
  if (!start || !end) return 'errTimeRequired'
  if (end <= start) return 'errEndBeforeStart'
  return null
}

/** Shift options for Office Hour's own local control: `ACADEMIC_SHIFTS`
 *  canonical order intersected with what the School has configured (Q12) --
 *  never the School's raw storage order, and never the topbar's per-user
 *  Global Shift Selection (see ADR 0026). Empty when the School has no
 *  configured Shifts (No-Shift mode). */
export function officeHourShiftOptions(configuredShifts: readonly string[]): AcademicShift[] {
  return ACADEMIC_SHIFTS.filter((s) => configuredShifts.includes(s))
}

/** Which Shift tab is active: the requested one if it's still a valid option,
 *  else the first option in canonical order, else null (No-Shift mode). */
export function resolveActiveShift(options: readonly string[], requested: string | null): string | null {
  if (requested && options.includes(requested)) return requested
  return options[0] ?? null
}

export interface OfficeHourSelectionKey {
  employee_category: string
  day_of_week: number
}

/** The bulk-save cross product (issue #643 §3): N categories x M days for one
 *  Shift becomes N x M records in a single save. */
export function expandOfficeHourSelections(
  categories: readonly string[],
  days: readonly number[],
): OfficeHourSelectionKey[] {
  const out: OfficeHourSelectionKey[] = []
  for (const employee_category of categories) {
    for (const day_of_week of days) out.push({ employee_category, day_of_week })
  }
  return out
}

export interface OfficeHourRow {
  id: string
  employee_category: string
  day_of_week: number
  start_time: string
  end_time: string
}

export interface OfficeHourCategoryRow {
  category: string
  cells: Map<number, OfficeHourRow>
}

/** Groups rows into matrix rows, canonical `EMPLOYEE_CATEGORIES` declaration
 *  order (never alphabetical), including only categories with at least one
 *  saved entry for the currently active Shift (Q7) -- a compact,
 *  glance-readable table rather than 20 mostly-empty rows. */
export function groupOfficeHoursByCategory(
  rows: readonly OfficeHourRow[],
  categoriesInOrder: readonly string[],
): OfficeHourCategoryRow[] {
  const out: OfficeHourCategoryRow[] = []
  for (const category of categoriesInOrder) {
    const categoryRows = rows.filter((r) => r.employee_category === category)
    if (!categoryRows.length) continue
    const cells = new Map<number, OfficeHourRow>()
    for (const r of categoryRows) cells.set(r.day_of_week, r)
    out.push({ category, cells })
  }
  return out
}
