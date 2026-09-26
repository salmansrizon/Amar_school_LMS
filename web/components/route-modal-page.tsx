import type { ComponentType } from 'react'
import { currentLang } from '@/lib/i18n-server'
import { t, type MessageKey } from '@/lib/i18n'
import { RouteModal } from '@/components/route-modal'

/**
 * An intercepting route's page: the existing task page, unchanged, inside a
 * RouteModal titled like the row action that opened it. One line per route:
 * `export default routeModalPage(MarksEntryPage, 'exams.markEntry')`.
 */
export function routeModalPage<P extends object>(Page: ComponentType<P>, titleKey: MessageKey) {
  return async function RouteModalPage(props: P) {
    const lang = await currentLang()
    return (
      <RouteModal title={t(titleKey, lang)} closeLabel={t('common.close', lang)}>
        <Page {...props} />
      </RouteModal>
    )
  }
}
