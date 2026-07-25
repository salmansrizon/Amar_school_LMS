import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { daysUntil, startOfUtcToday, SOON_EXPIRING_DAYS } from '@/lib/super-admin/dashboard'

// Upcoming-expiry view (issue #162): every school that has a subscription
// expiry, soonest first, highlighting the ones within SOON_EXPIRING_DAYS (the
// same window the dashboard KPI counts). Blocked schools are excluded — their
// access is already denied regardless of expiry.
export default async function UpcomingExpiryPage() {
  const lang = await currentLang()
  const { supabase } = await getSuperAdminContext()

  const { data: schools } = await supabase
    .from('schools')
    .select('id, name, subscription_expires_at, deactivated_at')
    .not('subscription_expires_at', 'is', null)
    .is('deactivated_at', null)
    .order('subscription_expires_at', { ascending: true })

  const today = startOfUtcToday()
  const rows = (schools ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    expiry: s.subscription_expires_at as string,
    daysLeft: daysUntil(today, new Date((s.subscription_expires_at as string) + 'T00:00:00Z')),
  }))

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('sa.expiry.upcomingTitle', lang)}</h1>
        <Link href="/super-admin/schools" className="text-sm text-brand-600 hover:underline">
          ← {t('sa.school.backToList', lang)}
        </Link>
      </div>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">{t('sa.expiry.none', lang)}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {rows.map((r) => {
              const expired = r.daysLeft < 0
              const soon = r.daysLeft >= 0 && r.daysLeft <= SOON_EXPIRING_DAYS
              return (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <Link href={`/super-admin/schools/${r.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.name}
                  </Link>
                  <span className="flex items-center gap-2">
                    <span className="text-muted">{r.expiry}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        expired
                          ? 'bg-alert-soft text-alert-deep'
                          : soon
                            ? 'bg-sky-soft text-sky-deep'
                            : 'bg-paper-muted text-muted'
                      }`}
                    >
                      {expired
                        ? t('sa.expiry.overdue', lang)
                        : r.daysLeft === 0
                          ? t('sa.soonExpiring.today', lang)
                          : `${r.daysLeft} ${t('sa.soonExpiring.days', lang)}`}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
