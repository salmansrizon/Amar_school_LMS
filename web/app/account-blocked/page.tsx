import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { LogoutButton } from '@/components/logout-button'

// Shown when an owner/staff member of a deactivated school (schools.deactivated_at
// set by the super-admin, issue #161) reaches a protected path. The proxy rewrites
// here; the login form also signs a blocked member straight back out. This is the
// hard-block message — separate from the subscription-expired gate (#169).
export default async function AccountBlockedPage() {
  const lang = await currentLang()
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper-muted p-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-paper p-8 text-center">
        <h1 className="text-xl font-extrabold text-alert-deep">{t('blocked.title', lang)}</h1>
        <p className="mt-3 text-sm text-muted">{t('blocked.message', lang)}</p>
        <div className="mt-6 flex justify-center gap-3">
          <LogoutButton
            label={t('shell.logout', lang)}
            className="cursor-pointer rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          />
          <Link
            href="/login"
            className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold hover:bg-paper-muted"
          >
            {t('login.title', lang)}
          </Link>
        </div>
      </div>
    </main>
  )
}
