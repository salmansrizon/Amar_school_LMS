import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

export default async function PermissionDeniedPage() {
  const lang = await currentLang()
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-paper p-8 text-center shadow-card">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-alert-soft text-2xl">
          🚫
        </div>
        <h1 className="text-xl font-bold">{t('denied.title', lang)}</h1>
        <p className="mt-2 text-sm text-muted">{t('denied.body', lang)}</p>
        <Link
          href="/school"
          className="mt-5 inline-flex h-10 items-center rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          {t('denied.back', lang)}
        </Link>
      </div>
    </main>
  )
}
