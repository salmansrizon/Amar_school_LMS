import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

// The 404 every wrong URL lands on. Without this file Next serves its own
// built-in page: "404 — This page could not be found.", in English, unstyled,
// with no way back — which is what a Student mistyping /student/routines saw.
export default async function NotFound() {
  const lang = await currentLang()
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-paper-muted p-6 text-center">
      <span className="text-5xl font-extrabold text-brand-600">404</span>
      <h1 className="text-xl font-extrabold">{t('notFound.title', lang)}</h1>
      <p className="max-w-sm text-sm text-muted">{t('notFound.body', lang)}</p>
      {/* "/" and not a role home: this renders outside every role layout, and
          the proxy already routes a signed-in user from the root to their own. */}
      <Link
        href="/"
        className="mt-2 rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600"
      >
        {t('notFound.home', lang)}
      </Link>
    </main>
  )
}
