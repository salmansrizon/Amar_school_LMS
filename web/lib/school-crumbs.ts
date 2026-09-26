import { t, type Lang } from '@/lib/i18n'
import { navGroupFor } from '@/lib/school-nav'

// Breadcrumb trail for a School Owner page (map 013): Dashboard › <sidebar
// group> › …items. The group label comes from the nav, so a page never names
// its own section by hand.

export function schoolCrumbs(pathname: string, lang: Lang, items: { label: string; href?: string }[]) {
  const group = navGroupFor(pathname)?.group
  return {
    lang,
    items: [
      { label: t('dash.dashboard', lang), href: '/school' },
      ...(group ? [{ label: t(group.labelKey, lang) }] : []),
      ...items,
    ],
  }
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
