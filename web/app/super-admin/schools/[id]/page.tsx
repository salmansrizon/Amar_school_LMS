import Link from 'next/link'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { rootDomain } from '@/lib/auth/tenant-host'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { buildActivationUrl } from '@/lib/super-admin/activation'
import { startOfUtcToday } from '@/lib/subscription'
import { lifecycleStatus } from '@/lib/super-admin/dashboard'
import { LIFECYCLE_STATUS_KEY, LIFECYCLE_STATUS_STYLE } from '@/lib/super-admin/status-ui'
import { SchoolDetailControls } from './school-detail-controls'
import { SchoolExpiryControl } from './expiry-control'
import { FeatureFlagToggles } from './feature-flags'

// Super-admin school detail (map #158, ticket #161): the lifecycle surface for
// one school — status, activation links, force-offline block, and the delete
// danger zone. Feature-flag toggles land on this page in #168; expiry controls
// in #162.
export default async function SchoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang = await currentLang()
  const { supabase } = await getSuperAdminContext()

  const [{ data: school }, { data: history }, { data: codes }, { data: flags }] = await Promise.all([
    supabase
      .from('schools')
      .select('id, name, subscription_expires_at, deactivated_at, subdomain')
      .eq('id', id)
      .maybeSingle(),
    supabase.rpc('schools_with_code_history'),
    supabase
      .from('school_claim_codes')
      .select('code, redeemed_at')
      .eq('school_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('school_feature_flags').select('flag_key').eq('school_id', id).eq('enabled', true),
  ])
  if (!school) notFound()

  const hasCodeHistory = new Set((history ?? []) as string[]).has(school.id)
  const status = lifecycleStatus(
    {
      id: school.id,
      name: school.name,
      subscription_expires_at: school.subscription_expires_at,
      deactivated_at: school.deactivated_at,
      hasCodeHistory,
    },
    startOfUtcToday(),
  )
  // Outstanding (unredeemed) claim codes become copyable activation links.
  const activationLinks = (codes ?? [])
    .filter((c) => c.redeemed_at === null)
    .map((c) => ({ code: c.code, url: buildActivationUrl(rootDomain(), c.code) }))

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
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LIFECYCLE_STATUS_STYLE[status]}`}>
            {t(LIFECYCLE_STATUS_KEY[status], lang)}
          </span>
          <span className="text-sm text-muted">
            {school.subscription_expires_at
              ? `${t('sa.school.expiry', lang)}: ${school.subscription_expires_at}`
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
        <SchoolExpiryControl schoolId={school.id} expiry={school.subscription_expires_at} lang={lang} />
      </div>

      <div className="mb-4">
        <FeatureFlagToggles
          schoolId={school.id}
          enabled={(flags ?? []).map((f) => f.flag_key)}
          lang={lang}
        />
      </div>

      <SchoolDetailControls
        schoolId={school.id}
        schoolName={school.name}
        blocked={school.deactivated_at !== null}
        activationLinks={activationLinks}
        lang={lang}
      />
    </main>
  )
}
