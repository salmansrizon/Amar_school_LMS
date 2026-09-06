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
