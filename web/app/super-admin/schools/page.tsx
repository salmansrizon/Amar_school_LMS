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
import { EntityAvatar } from '@/components/entity-avatar'
import { Pager, paginate } from '@/components/pager'
import type { Tone } from '@/components/ui/page'

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
const STATUS_RAIL: Record<LifecycleStatus, Tone> = {
  trial: 'sky',
  active: 'mint',
  expired: 'alert',
  blocked: 'sun',
}

export default async function SchoolsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const lang = await currentLang()
  const { page: pageParam } = await searchParams
  const { supabase } = await getSuperAdminContext()
  const schools = await loadSchoolsManager(supabase)
  const { page, totalPages, total, items } = paginate(schools, pageParam, 10)

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
        {items.map((s) => (
          <SectionCard key={s.id} tone={STATUS_RAIL[s.status]}>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <EntityAvatar name={s.name} id={s.id} />
              <h2 className="min-w-0 flex-1 truncate text-sm font-extrabold text-ink">{s.name}</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[s.status]}`}>
                {t(STATUS_KEY[s.status], lang)}
              </span>
              <Link
                href={`/super-admin/schools/${s.id}`}
                className="rounded-full border border-line-strong px-3 py-0.5 text-xs font-semibold hover:bg-paper-muted"
              >
                {t('sa.school.viewDetail', lang)}
              </Link>
            </div>

            {/* Compact summary — the only thing shown at rest (docs/ui.md) */}
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label={t('schools.subdomain', lang)} value={s.subdomain ?? '—'} mono />
              <Stat label={t('sa.school.students', lang)} value={String(s.studentCount)} />
              <Stat label={t('schools.expiry', lang)} value={s.subscriptionExpiresAt ?? '—'} />
              <Stat
                label={t('sa.school.subscription', lang)}
                value={s.monthsPaid > 0 ? `${s.monthsPaid} ${t('sa.school.months', lang)}` : '—'}
              />
            </dl>

            {/* Config, credits, subscription & codes — folded behind one বিস্তারিত expand */}
            <details className="group mt-3 rounded-xl border border-line/70">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-semibold text-ink">
                {t('sa.school.more', lang)}
                <span className="text-muted transition group-open:rotate-180" aria-hidden="true">
                  ▾
                </span>
              </summary>
              <div className="flex flex-col gap-3 border-t border-line/70 px-3 py-3">
                {/* Payment ledger (T2): total ৳ · last-paid (months paid shown at rest) */}
                <dl className="grid grid-cols-2 gap-2">
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
              </div>
            </details>
          </SectionCard>
        ))}
      </div>

      <Pager page={page} totalPages={totalPages} total={total} lang={lang} />
    </main>
  )
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-paper-muted px-3 py-2">
      <dt className="text-[11px] font-semibold text-muted">{label}</dt>
      <dd className={`truncate text-base font-extrabold text-ink${mono ? ' font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
