import { cookies } from 'next/headers'
import { SIDEBAR_COOKIE, parseSidebarCollapsed } from '@/lib/ui-prefs'

/** The persisted sidebar collapse choice, read before first paint (issue #115). */
export async function sidebarCollapsed(): Promise<boolean> {
  const store = await cookies()
  return parseSidebarCollapsed(store.get(SIDEBAR_COOKIE)?.value)
}
