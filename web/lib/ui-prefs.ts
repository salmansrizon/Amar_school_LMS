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
