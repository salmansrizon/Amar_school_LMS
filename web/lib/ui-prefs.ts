// Deliberate UI preferences that must survive navigation, refresh and re-login.
//
// Stored in cookies rather than localStorage so the server renders the chrome in
// the chosen state on first paint — localStorage is only readable after mount,
// which would render expanded and then jump (issue #115). Same convention as the
// `lang` cookie (`lib/i18n-server.ts`).

export const SIDEBAR_COOKIE = 'asm-sidebar-collapsed'
export const SIDEBAR_MAX_AGE = 31536000 // one year, in seconds

/** Cookie value -> collapsed flag. Anything unrecognised means "expanded". */
export function parseSidebarCollapsed(value: string | undefined): boolean {
  return value === '1'
}

/**
 * The full `document.cookie` assignment string that persists the collapse
 * choice — name, value and attributes, not just the value.
 */
export function sidebarCookieAssignment(collapsed: boolean): string {
  return `${SIDEBAR_COOKIE}=${collapsed ? '1' : '0'};path=/;max-age=${SIDEBAR_MAX_AGE};samesite=lax`
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
  return `${THEME_COOKIE}=${preference};path=/;max-age=${SIDEBAR_MAX_AGE};samesite=lax`
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
