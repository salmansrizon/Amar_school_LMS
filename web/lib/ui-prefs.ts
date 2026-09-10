// Deliberate UI preferences that must survive navigation, refresh and re-login.
//
// Stored in cookies rather than localStorage so the server renders the chrome in
// the chosen state on first paint — localStorage is only readable after mount,
// which would render expanded and then jump (issue #115). Same convention as the
// `lang` cookie (`lib/i18n-server.ts`).

export const SIDEBAR_COOKIE = 'asm-sidebar-collapsed'
/** Shared by every UI preference cookie here — one year, in seconds. */
export const PREF_MAX_AGE = 31536000

/** Cookie value -> collapsed flag. Anything unrecognised means "expanded". */
export function parseSidebarCollapsed(value: string | undefined): boolean {
  return value === '1'
}

/**
 * The full `document.cookie` assignment string that persists the collapse
 * choice — name, value and attributes, not just the value.
 */
export function sidebarCookieAssignment(collapsed: boolean): string {
  return `${SIDEBAR_COOKIE}=${collapsed ? '1' : '0'};path=/;max-age=${PREF_MAX_AGE};samesite=lax`
}

// Theme (map #370) — the implementation ADR 0005 has been waiting for. Same
// cookie convention as the sidebar and `lang`, for the same reason: the server
// paints the chosen theme on first render instead of flashing light and
// correcting after hydration.

export const THEME_COOKIE = 'asm-theme'

/** What the user chose, which is not the same as what they see: `system` defers
 *  to the OS and so has no fixed appearance. */
export type ThemePreference = 'light' | 'dark' | 'system'

const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system']

/** Cookie value -> preference. Anything unrecognised means "follow the system". */
export function parseThemePreference(value: string | undefined): ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : 'system'
}

/** The full `document.cookie` assignment string that persists the theme choice. */
export function themeCookieAssignment(preference: ThemePreference): string {
  return `${THEME_COOKIE}=${preference};path=/;max-age=${PREF_MAX_AGE};samesite=lax`
}

/**
 * The `data-theme` value for `<html>`, or `undefined` to stamp no attribute.
 *
 * This is what makes all three states work with no script and no flash. An
 * explicit choice stamps the attribute, and the stylesheet's `[data-theme]`
 * rules outrank its `prefers-color-scheme` block. `system` deliberately stamps
 * nothing, leaving that media query in charge — so the OS theme applies at
 * paint time, and follows the OS live if the user changes it mid-session.
 */
export function themeAttribute(preference: ThemePreference): 'light' | 'dark' | undefined {
  return preference === 'system' ? undefined : preference
}

// Global Shift Selection (issue #577, Wave 5/#590) — a per-user, per-request
// view preference: which of the institute's currently configured Shifts this
// user is working with right now. Never a source of truth for anything —
// RLS and authorization never read this cookie; it only narrows what a
// read-time list query returns (#579), reconciled fresh on every read
// against `schools.configured_shifts`, never persisted as a business record.

export const SHIFT_SELECTION_COOKIE = 'asm-shift-selection'

/** The full `document.cookie` assignment string that persists the Shift
 *  selection — comma-joined ACADEMIC_SHIFTS values, no re-encoding. */
export function shiftSelectionCookieAssignment(shifts: readonly string[]): string {
  return `${SHIFT_SELECTION_COOKIE}=${shifts.join(',')};path=/;max-age=${PREF_MAX_AGE};samesite=lax`
}

/**
 * Reconciles the raw cookie value against the institute's currently
 * configured Shifts (issue #577's resolution table):
 * - missing, empty, or fully-invalid → every configured Shift (safe default)
 * - partially-invalid → keeps only the still-valid values; a selection with
 *   at least one surviving value never falls back to "all" just because
 *   another value in it became invalid
 * - `configuredShifts` itself empty (No Shift institute) → always `[]`,
 *   there's nothing to select regardless of what the cookie says
 */
export function parseShiftSelection(
  cookieValue: string | undefined,
  configuredShifts: readonly string[],
): string[] {
  if (configuredShifts.length === 0) return []

  const requested = cookieValue ? cookieValue.split(',').filter(Boolean) : []
  const valid = requested.filter((s) => configuredShifts.includes(s))

  return valid.length > 0 ? valid : [...configuredShifts]
}

// Global Academic Year Selection (map #609) — the year twin of the Global Shift
// Selection above: a per-user, per-request view preference over which of the
// School's *started* Academic Years (`school_academic_years`, #610) this user is
// currently looking at. Never a source of truth — RLS and authorization never
// read it, and it never writes `schools.active_academic_year`; it only narrows
// what a browse-time Offering list returns, reconciled fresh on every read
// against the started-years list. The current year is always included and can
// never be deselected.

export const ACADEMIC_YEAR_SELECTION_COOKIE = 'asm-academic-year-selection'

/** The full `document.cookie` assignment string that persists the Academic Year
 *  selection — comma-joined years, no re-encoding. */
export function academicYearSelectionCookieAssignment(years: readonly number[]): string {
  return `${ACADEMIC_YEAR_SELECTION_COOKIE}=${years.join(',')};path=/;max-age=${PREF_MAX_AGE};samesite=lax`
}

/**
 * Reconciles the raw cookie value against this School's *started* Academic
 * Years, always keeping the current year visible:
 * - `activeYear` (when non-null) is always in the result — it can never be
 *   deselected, even if the cookie omits it
 * - any requested year not in `startedYears` is dropped
 * - missing, empty, or fully-invalid cookie → every started year (the
 *   "everything visible" default, mirroring `parseShiftSelection`'s
 *   repair-to-all)
 * - result sorted newest first, matching the started-years list convention
 *
 * `activeYear` null (a School whose row predates the #610 backfill) → just the
 * requested years that are started, which may be `[]`.
 */
export function parseAcademicYearSelection(
  raw: string | undefined,
  startedYears: readonly number[],
  activeYear: number | null,
): number[] {
  const requested = raw
    ? raw
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n))
    : []
  const valid = requested.filter((y) => startedYears.includes(y))

  const base = valid.length > 0 ? valid : [...startedYears]
  const withActive = activeYear != null && !base.includes(activeYear) ? [...base, activeYear] : base

  return [...new Set(withActive)].sort((a, b) => b - a)
}

/**
 * The next Academic Year selection after the user toggles `year` in the context
 * popover (ticket #613). The active year can never be removed — toggling it is a
 * no-op that returns the current selection unchanged — so the "current year is
 * always visible" invariant holds client-side too, not only after
 * `parseAcademicYearSelection` repairs the cookie on the next read. Any other
 * year flips in or out. Result de-duped and sorted newest first, matching
 * `parseAcademicYearSelection`.
 */
export function toggleAcademicYearSelection(
  current: readonly number[],
  year: number,
  activeYear: number | null,
): number[] {
  if (year === activeYear) return [...current]
  const next = current.includes(year) ? current.filter((y) => y !== year) : [...current, year]
  return [...new Set(next)].sort((a, b) => b - a)
}

/** Whether the context popover shows its Academic Year section (ticket #613).
 *  A School that has started at most one year has no choice to offer, so it
 *  sees exactly today's Shift-only popover — the section appears only from the
 *  second started year on. */
export function academicYearSectionVisible(startedYears: readonly number[]): boolean {
  return startedYears.length > 1
}
