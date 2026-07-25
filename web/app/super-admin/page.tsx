import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type MessageKey } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { startOfUtcToday } from '@/lib/subscription'
import { summarizeSchools, type SchoolRow } from '@/lib/super-admin/dashboard'

// Super-admin KPI dashboard landing (map #158, ticket #160): school counts by
// lifecycle status, the soon-expiring list, plus gov-official / dealer / codes
// tallies. Replaces the bare RoleShell card; the sidebar comes from the layout.
// The role gate lives in getSuperAdminContext (shared with the layout).
export default async function SuperAdminDashboard() {
  const lang = await currentLang()
  const { supabase } = await getSuperAdminContext()

  const [{ data: schools }, { data: history }, { count: govCount }, { count: dealerCount }, { count: codesOutstanding }] =
    await Promise.all([
      supabase.from('schools').select('id, name, subscription_expires_at, deactivated_at').order('name'),
      supabase.rpc('schools_with_code_history'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'gov_official'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'dealer'),
      supabase.from('subscription_codes').select('id', { count: 'exact', head: true }).is('redeemed_at', null),
    ])

  // `schools_with_code_history` returns setof uuid → bare strings, not objects.
  const withHistory = new Set((history ?? []) as string[])
  const rows: SchoolRow[] = (schools ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    subscription_expires_at: s.subscription_expires_at,
    deactivated_at: s.deactivated_at,
    hasCodeHistory: withHistory.has(s.id),
  }))
  const kpi = summarizeSchools(rows, startOfUtcToday())

  const cards: { key: MessageKey; value: number; href?: string; tone: string }[] = [
    { key: 'sa.kpi.totalSchools', value: kpi.total, href: '/super-admin/schools', tone: 'text-ink' },
    { key: 'sa.kpi.trial', value: kpi.trial, tone: 'text-sky-deep' },
    { key: 'sa.kpi.active', value: kpi.active, tone: 'text-mint-deep' },
    { key: 'sa.kpi.expired', value: kpi.expired, tone: 'text-alert-deep' },
    { key: 'sa.kpi.blocked', value: kpi.blocked, tone: 'text-alert-deep' },
    { key: 'sa.kpi.govOfficials', value: govCount ?? 0, href: '/super-admin/gov-officials', tone: 'text-ink' },
    { key: 'sa.kpi.dealers', value: dealerCount ?? 0, href: '/super-admin/partners', tone: 'text-ink' },
    { key: 'sa.kpi.codesOutstanding', value: codesOutstanding ?? 0, href: '/super-admin/codes', tone: 'text-ink' },
  ]

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <h1 className="mb-4 text-2xl font-extrabold">{t('sa.nav.dashboard', lang)}</h1>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => {
          const body = (
            <div className="rounded-lg border border-line bg-paper p-4 shadow-card transition hover:border-brand-300">
              <div className={`text-3xl font-extrabold ${c.tone}`}>{c.value}</div>
              <div className="mt-1 text-xs font-semibold text-muted">{t(c.key, lang)}</div>
            </div>
          )
          return c.href ? (
            <Link key={c.key} href={c.href}>
              {body}
            </Link>
          ) : (
            <div key={c.key}>{body}</div>
          )
        })}
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">{t('sa.soonExpiring.title', lang)}</h2>
          <Link href="/super-admin/schools/upcoming" className="text-sm text-brand-600 hover:underline">
            {t('sa.expiry.viewUpcoming', lang)}
          </Link>
        </div>
        {kpi.soonExpiring.length === 0 ? (
          <p className="text-sm text-muted">{t('sa.soonExpiring.none', lang)}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {kpi.soonExpiring.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <Link href={`/super-admin/schools/${s.id}`} className="font-medium text-brand-700 hover:underline">
                  {s.name}
                </Link>
                <span className="flex items-center gap-2">
                  <span className="text-muted">{s.expiry}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      s.daysLeft <= 2 ? 'bg-alert-soft text-alert-deep' : 'bg-sky-soft text-sky-deep'
                    }`}
                  >
                    {s.daysLeft === 0
                      ? t('sa.soonExpiring.today', lang)
                      : `${s.daysLeft} ${t('sa.soonExpiring.days', lang)}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
