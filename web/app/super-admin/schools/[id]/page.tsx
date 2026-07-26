import Link from 'next/link'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { loadSchoolDetail } from '@/lib/super-admin/school-detail-read-model'
import { LIFECYCLE_STATUS_KEY, LIFECYCLE_STATUS_STYLE } from '@/lib/super-admin/status-ui'
import { SchoolDetailControls } from './school-detail-controls'
import { SchoolExpiryControl } from './expiry-control'
import { FeatureFlagToggles } from './feature-flags'
import { SmsCreditPanel } from './sms-credit-panel'

// Super-admin school detail (map #158 origin): the lifecycle surface for one
// school — status, activation links, pause/resume, delete, feature flags, and
// the SMS-credit panel (#171 T7). The fetch→shape→classify work lives in the
// school-detail read model (arch review round 2); this page renders the VM.
export default async function SchoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang = await currentLang()
  const { supabase } = await getSuperAdminContext()

  const school = await loadSchoolDetail(supabase, id)
  if (!school) notFound()

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{school.name}</h1>
        <Link href="/super-admin/schools" className="text-sm text-brand-600 hover:underline">
          ← {t('sa.school.backToList', lang)}
        </Link>
      </div>

      <section className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LIFECYCLE_STATUS_STYLE[school.status]}`}>
            {t(LIFECYCLE_STATUS_KEY[school.status], lang)}
          </span>
          <span className="text-sm text-muted">
            {school.subscriptionExpiresAt
              ? `${t('sa.school.expiry', lang)}: ${school.subscriptionExpiresAt}`
              : t('sa.school.noExpiry', lang)}
          </span>
          {school.subdomain && (
            <span className="text-sm text-muted">
              {t('schools.subdomain', lang)}: <span className="font-mono">{school.subdomain}</span>
            </span>
          )}
        </div>
      </section>

      <div className="mb-4">
        <SchoolExpiryControl schoolId={school.id} expiry={school.subscriptionExpiresAt} lang={lang} />
      </div>

      <div className="mb-4">
        <FeatureFlagToggles schoolId={school.id} enabled={school.enabledFlags} lang={lang} />
      </div>

      <div className="mb-4">
        <SmsCreditPanel schoolId={school.id} balance={school.smsBalance} entries={school.ledger} lang={lang} />
      </div>

      <SchoolDetailControls
        schoolId={school.id}
        schoolName={school.name}
        blocked={school.blocked}
        activationLinks={school.activationLinks}
        lang={lang}
      />
    </main>
  )
}
