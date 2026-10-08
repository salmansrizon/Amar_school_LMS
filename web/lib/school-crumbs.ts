import { t, type Lang } from '@/lib/i18n'
import { navGroupFor } from '@/lib/school-nav'
import type { Crumb } from '@/components/ui/page'
import { ATTENDANCE_GROUPS } from '@/lib/attendance-nav'

// Breadcrumb trail for a School Owner page (map 013): Dashboard › <sidebar
// group> › …tail. The group label comes from the nav, so a page never names
// its own section by hand. Tail crumbs may be passed as an array or spread.

export function schoolCrumbs(pathname: string, lang: Lang, ...tail: (Crumb | Crumb[])[]): { lang: Lang; items: Crumb[] } {
  const group = navGroupFor(pathname)?.group
  return {
    lang,
    items: [
      { label: t('dash.dashboard', lang), href: '/school' },
      ...(group ? [{ label: t(group.labelKey, lang) }] : []),
      ...tail.flat(),
    ],
  }
}

/** Trail for an Attendance page: Dashboard › group › Attendance › area. The
 *  area (Students, Employees, Off-Day Calendar, Machine) is the one whose pages
 *  include `activeHref` — the same lookup the area row uses — so the trail and
 *  the row cannot disagree. */
export function attendanceCrumbs(activeHref: string, lang: Lang): { lang: Lang; items: Crumb[] } {
  const area = ATTENDANCE_GROUPS.find((g) => (g.tabs ? g.tabs.some((tab) => tab.href === activeHref) : g.href === activeHref))
  return schoolCrumbs(
    '/school/attendance',
    lang,
    area
      ? [{ label: t('attendance.title', lang), href: '/school/attendance' }, { label: t(area.labelKey, lang) }]
      : [{ label: t('attendance.title', lang) }],
  )
}

/** PageHeader action pills, same as the student/employee directories. */
export const headerSecondary =
  'inline-flex h-11 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted'
export const headerPrimary =
  'inline-flex h-11 items-center rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600'
/** A row's inline action link inside a DataTable. */
export const rowAction =
  'inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted'
export const rowActionPrimary =
  'inline-flex h-9 items-center rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600'
