import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { loadSuperAdminDashboard } from '@/lib/super-admin/dashboard-read-model'
import { PageHeader, KpiCard, SectionCard, QuickAction, formatTaka } from '@/components/super-admin/dashboard-ui'
import { BarTrend, StatusDonut } from '@/components/super-admin/charts'
import { RenewalsChaseList } from './renewals-chase-list'
import { RecentActivity } from './recent-activity'

// Super-admin business dashboard landing (map #171, T3): the money and the fleet
// at a glance — income KPIs + trend, school-status donut, and the soon-expiring
// list. The fetch→shape→aggregate composition lives in the dashboard read model
// (arch review); this page just calls it and renders. Role gate is in
// getSuperAdminContext (shared with the layout). Deep, actionable lists (the
// renewals chase list) land on T5.

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
  sms: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
} as const

export default async function SuperAdminDashboard() {
  const lang = await currentLang()
  const { supabase } = await getSuperAdminContext()

  const { kpis: kpi, income, smsIncome, incomeSeries: series, pending, dormant, payable, activity } =
    await loadSuperAdminDashboard(supabase)

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

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
        <KpiCard
          label={t('sa.kpi.incomeMonth', lang)}
          value={formatTaka(income.total)}
          delta={income.delta ?? undefined}
          hint={t('sa.dash.vsLastMonth', lang)}
          tone="green"
          icon={ICON.income}
        />
        <KpiCard
          label={t('sa.kpi.smsIncome', lang)}
          value={formatTaka(smsIncome.total)}
          delta={smsIncome.delta ?? undefined}
          hint={t('sa.dash.vsLastMonth', lang)}
          tone="brand"
          icon={ICON.sms}
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

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={t('sa.dash.renewals', lang)}
          action={
            <Link href="/super-admin/schools/upcoming" className="text-sm font-semibold text-brand-600 hover:underline">
              {t('sa.expiry.viewUpcoming', lang)}
            </Link>
          }
          bodyClassName="p-0"
        >
          <RenewalsChaseList rows={payable.rows} lang={lang} />
        </SectionCard>

        <SectionCard title={t('sa.dash.recentActivity', lang)} bodyClassName="p-0">
          <RecentActivity events={activity} lang={lang} />
        </SectionCard>
      </section>
    </main>
  )
}
