import { currentLang } from '@/lib/i18n-server'
import { CodeNotValid } from './card'

// What notFound() renders anywhere under /verify/d, with HTTP 404.
export default async function VerifyDocumentNotFound() {
  return <CodeNotValid lang={await currentLang()} />
}
