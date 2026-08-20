import { cookies } from 'next/headers'
import {
  SIDEBAR_COOKIE,
  THEME_COOKIE,
  parseSidebarCollapsed,
  parseThemePreference,
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
