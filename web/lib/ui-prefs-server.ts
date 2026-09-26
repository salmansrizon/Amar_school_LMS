import { cookies } from 'next/headers'
import {
  SIDEBAR_COOKIE,
  THEME_COOKIE,
  SHIFT_SELECTION_COOKIE,
  ACADEMIC_YEAR_SELECTION_COOKIE,
  parseSidebarCollapsed,
  parseThemePreference,
  parseShiftSelection,
  parseAcademicYearSelection,
  type ThemePreference,
} from '@/lib/ui-prefs'

/** The persisted sidebar collapse choice, read before first paint (issue #115). */
export async function sidebarCollapsed(): Promise<boolean> {
  const store = await cookies()
  return parseSidebarCollapsed(store.get(SIDEBAR_COOKIE)?.value)
}

/** The persisted theme choice, read before first paint so the server can stamp
 *  `data-theme` and the page never flashes the wrong palette (map #370). */
export async function themePreference(): Promise<ThemePreference> {
  const store = await cookies()
  return parseThemePreference(store.get(THEME_COOKIE)?.value)
}

/** The effective Global Shift Selection (issue #577), reconciled against
 *  this School's currently configured Shifts. Callers must pass their own
 *  already-fetched `schools.configured_shifts` — this module has no notion
 *  of "current school" on its own. */
export async function globalShiftSelection(configuredShifts: readonly string[]): Promise<string[]> {
  const store = await cookies()
  return parseShiftSelection(store.get(SHIFT_SELECTION_COOKIE)?.value, configuredShifts)
}

/** The effective Global Academic Year Selection (map #609), reconciled against
 *  this School's *started* Academic Years and always including the current year.
 *  Callers pass their own already-fetched started-years list and
 *  `schools.active_academic_year` — this module has no notion of "current
 *  school" on its own. */
export async function globalAcademicYearSelection(
  startedYears: readonly number[],
  activeYear: number | null,
): Promise<number[]> {
  const store = await cookies()
  return parseAcademicYearSelection(store.get(ACADEMIC_YEAR_SELECTION_COOKIE)?.value, startedYears, activeYear)
}
