import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { startOfUtcToday } from '@/lib/subscription'
import { summarizeSchools, type SchoolRow } from '@/lib/super-admin/dashboard'
import {
  incomeSeries,
  latestIncome,
  pendingCollection,
  dormantCount,
  type CodeRow,
} from '@/lib/super-admin/financials'
import { PageHeader, KpiCard, SectionCard, QuickAction, formatTaka } from '@/components/super-admin/dashboard-ui'
import { BarTrend, StatusDonut } from '@/components/super-admin/charts'

// Super-admin business dashboard landing (map #171, T3): the money and the fleet
// at a glance — income KPIs + trend, school-status donut, and the soon-expiring
// list. Built on the T1 design primitives over the T2 financial data layer; the
// role gate lives in getSuperAdminContext (shared with the layout). Deep,
// actionable lists (the renewals chase list) land on T5.
const TREND_MONTHS = 12

// Inline KPI-card icons (stroke paths handed to KpiCard's StrokeIcon).
const ICON = {
  income: <path d="M3 17l6-6 4 4 8-8M21 7v5M21 7h-5" />,
  schools: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  pending: <path d="M4 4h16v4l-6 4 6 4v4H4v-4l6-4-6-4z" />,
  plus: <path d="M12 5v14M5 12h14" />,
} as const

export default async function SuperAdminDashboard() {
  const lang = await currentLang()
  const { supabase } = await getSuperAdminContext()

  const [{ data: schools }, { data: history }, { data: codes }] = await Promise.all([
    supabase.from('schools').select('id, name, subscription_expires_at, deactivated_at').order('name'),
    supabase.rpc('schools_with_code_history'),
    supabase.from('subscription_codes').select('price, redeemed_at, redeemed_school_id'),
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

  const codeRows = (codes ?? []) as CodeRow[]
  const series = incomeSeries(codeRows, { asOf: new Date(), months: TREND_MONTHS })
  const income = latestIncome(series)
  const pending = pendingCollection(codeRows)
  const dormant = dormantCount(kpi)

  const donut = [
    { label: t('sa.kpi.active', lang), value: kpi.active, colorClass: 'text-mint-deep' },
    { label: t('sa.kpi.trial', lang), value: kpi.trial, colorClass: 'text-sky-deep' },
    { label: t('sa.kpi.expired', lang), value: kpi.expired, colorClass: 'text-alert-deep' },
    { label: t('sa.kpi.blocked', lang), value: kpi.blocked, colorClass: 'text-amber-600' },
  ]

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={t('sa.dash.title', lang)}
        subtitle={t('sa.dash.subtitle', lang)}
        actions={
          <>
            <QuickAction href="/super-admin/schools" label={t('sa.action.createSchool', lang)} icon={ICON.plus} />
            <QuickAction
              href="/super-admin/codes"
              label={t('sa.action.generateCode', lang)}
              variant="ghost"
              icon={ICON.plus}
            />
          </>
        }
      />

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <KpiCard
          label={t('sa.kpi.incomeMonth', lang)}
          value={formatTaka(income.total)}
          delta={income.delta ?? undefined}
          hint={t('sa.dash.vsLastMonth', lang)}
          tone="green"
          icon={ICON.income}
        />
        <KpiCard
          label={t('sa.kpi.activeSchools', lang)}
          value={`${kpi.active} / ${kpi.total}`}
          hint={`${kpi.trial} ${t('sa.kpi.trial', lang).toLowerCase()} · ${kpi.expired} ${t('sa.kpi.expired', lang).toLowerCase()} · ${dormant} ${t('sa.kpi.dormant', lang).toLowerCase()}`}
          tone="brand"
          icon={ICON.schools}
        />
        <KpiCard
          label={t('sa.kpi.expiringSoon', lang)}
          value={kpi.soonExpiring.length}
          hint={t('sa.dash.next7Days', lang)}
          tone="amber"
          icon={ICON.clock}
        />
        <KpiCard
          label={t('sa.kpi.pending', lang)}
          value={formatTaka(pending.total)}
          hint={`${pending.count} ${t('sa.dash.pendingCodes', lang)}`}
          tone="rose"
          icon={ICON.pending}
        />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SectionCard title={t('sa.dash.incomeTrend', lang)}>
            <BarTrend data={series} formatValue={formatTaka} />
          </SectionCard>
        </div>
        <div className="lg:col-span-2">
          <SectionCard title={t('sa.dash.statusMix', lang)}>
            <StatusDonut segments={donut} centerValue={kpi.total} centerLabel={t('sa.dash.schools', lang)} />
          </SectionCard>
        </div>
      </section>

      <section className="mt-4">
        <SectionCard
          title={t('sa.soonExpiring.title', lang)}
          action={
            <Link href="/super-admin/schools/upcoming" className="text-sm font-semibold text-brand-600 hover:underline">
              {t('sa.expiry.viewUpcoming', lang)}
            </Link>
          }
          bodyClassName="p-0"
        >
          {kpi.soonExpiring.length === 0 ? (
            <p className="p-4 text-sm text-muted sm:p-5">{t('sa.soonExpiring.none', lang)}</p>
          ) : (
            <ul className="divide-y divide-line/70 text-sm">
              {kpi.soonExpiring.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <Link href={`/super-admin/schools/${s.id}`} className="truncate font-semibold text-brand-700 hover:underline">
                    {s.name}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-muted">{s.expiry}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
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
        </SectionCard>
      </section>
    </main>
  )
}
