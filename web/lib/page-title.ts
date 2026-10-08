import type { Metadata } from 'next'
import { currentLang } from '@/lib/i18n-server'
import { t, type MessageKey } from '@/lib/i18n'

/** Page title from the same message key the page's <h1> uses, in the reader's
 *  language. The root layout supplies the "· EdumeBD" half as a template. */
export function pageTitle(key: MessageKey) {
  return async function generateMetadata(): Promise<Metadata> {
    return { title: t(key, await currentLang()) }
  }
}
