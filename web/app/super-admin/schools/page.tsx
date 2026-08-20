import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type MessageKey } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { loadSchoolsManager } from '@/lib/super-admin/schools-read-model'
import type { LifecycleStatus } from '@/lib/super-admin/dashboard'
import { PageHeader, SectionCard, formatTaka } from '@/components/super-admin/dashboard-ui'
import { SchoolSubscriptionControls } from './subscription-controls'
import { SchoolManagement } from './school-management'
import { CreateSchoolForm } from './create-school-form'

// Super-admin schools manager (map #171 T4): the per-school ledger + control
// centre, restyled to the T1 design language. The fetch→shape→classify work
// lives in the schools read model; this page renders the cards. Each shows its
// lifecycle status (a single 4-state badge — paused = deactivated_at), payment
// history (months + total ৳ + last-paid, T2 ledger), and the in-place controls
// (subscription, header/subdomain/trial/claim, and — on the detail page —
// pause/resume, delete).
const STATUS_STYLE: Record<LifecycleStatus, string> = {
  trial: 'bg-sky-soft text-sky-deep',
  active: 'bg-mint-soft text-mint-deep',
  expired: 'bg-alert-soft text-alert-deep',
  blocked: 'bg-sun-soft text-sun-deep',
}
const STATUS_KEY: Record<LifecycleStatus, MessageKey> = {
  trial: 'schools.trial',
  active: 'schools.active',
  expired: 'schools.expired',
  blocked: 'sa.school.paused',
}
const STATUS_RAIL: Record<LifecycleStatus, 'sky' | 'mint' | 'alert' | 'sun'> = {
  trial: 'sky',
  active: 'mint',
  expired: 'alert',
  blocked: 'sun',
}

export default async function SchoolsPage() {
  const lang = await currentLang()
  const { supabase } = await getSuperAdminContext()
  const schools = await loadSchoolsManager(supabase)

  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={t('schools.title', lang)}
        actions={
          <Link href="/super-admin" className="text-sm font-semibold text-brand-600 hover:underline">
            ← {t('home.superAdmin', lang)}
          </Link>
        }
      />

      <section className="mt-6">
        <SectionCard title={t('schools.create', lang)}>
          <CreateSchoolForm lang={lang} />
        </SectionCard>
      </section>

      <div className="mt-4 flex flex-col gap-4">
        {schools.map((s) => (
          <SectionCard
            key={s.id}
            title={s.name}
            tone={STATUS_RAIL[s.status]}
            action={
              <span className="flex flex-wrap items-center justify-end gap-2 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[s.status]}`}>
                  {t(STATUS_KEY[s.status], lang)}
                </span>
                {s.subscriptionExpiresAt && (
                  <span className="text-muted">
                    {t('schools.expiry', lang)}: {s.subscriptionExpiresAt}
                  </span>
                )}
                <Link
                  href={`/super-admin/schools/${s.id}`}
                  className="rounded-full border border-line-strong px-3 py-0.5 text-xs font-semibold hover:bg-paper-muted"
                >
                  {t('sa.school.viewDetail', lang)}
                </Link>
              </span>
            }
          >
            {s.subdomain && (
              <p className="mb-3 text-sm text-muted">
                {t('schools.subdomain', lang)}: <span className="font-mono">{s.subdomain}</span>
              </p>
            )}

            {/* Payment ledger (T2): months paid · total ৳ · last-paid */}
            <dl className="mb-3 grid grid-cols-3 gap-2">
              <Stat label={t('sa.school.monthsPaid', lang)} value={String(s.monthsPaid)} />
              <Stat label={t('sa.school.totalPaid', lang)} value={formatTaka(s.totalPaid)} />
              <Stat label={t('sa.school.lastPaid', lang)} value={s.lastPaid === null ? '—' : formatTaka(s.lastPaid)} />
            </dl>

            <SchoolSubscriptionControls
              schoolId={s.id}
              expiry={s.subscriptionExpiresAt}
              status={s.status === 'blocked' ? 'expired' : s.status}
              lang={lang}
            />
            <SchoolManagement
              schoolId={s.id}
              subdomain={s.subdomain}
              hasOwner={s.hasOwner}
              header={s.header}
              codes={s.claimCodes}
              lang={lang}
            />
          </SectionCard>
        ))}
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-paper-muted px-3 py-2">
      <dt className="text-[11px] font-semibold text-muted">{label}</dt>
      <dd className="text-base font-extrabold text-ink">{value}</dd>
    </div>
  )
}
