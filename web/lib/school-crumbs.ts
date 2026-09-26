import { t, type Lang } from '@/lib/i18n'
import { navGroupFor } from '@/lib/school-nav'
import type { Crumb } from '@/components/ui/page'

/** PageHeader crumbs for a school page (map 013): Dashboard › nav group ›
 *  `tail`. The group comes from the sidebar (`navGroupFor`), so a page never
 *  hardcodes which section it lives in. */
export function schoolCrumbs(pathname: string, lang: Lang, ...tail: Crumb[]): { lang: Lang; items: Crumb[] } {
  const group = navGroupFor(pathname)?.group
  return {
    lang,
    items: [
      { label: t('dash.dashboard', lang), href: '/school' },
      ...(group ? [{ label: t(group.labelKey, lang) }] : []),
      ...tail,
    ],
  }
}
