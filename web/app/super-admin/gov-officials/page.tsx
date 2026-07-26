import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { PageHeader, SectionCard } from '@/components/super-admin/dashboard-ui'
import { CreateGovForm } from './create-gov-form'

// Government Officials management (map #158, ticket #164) — distinct from the
// dealer/partner list. Lists gov_official accounts with their designation; the
// detail page edits designation, education scope and territory assignments.
// Restyled to the T1 design language (map #171 T10 — cosmetic only).
export default async function GovOfficialsPage() {
  const lang = await currentLang()
  const { supabase } = await getSuperAdminContext()

  const [{ data: officials }, { data: profiles }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('role', 'gov_official').order('created_at'),
    supabase.from('gov_official_profiles').select('profile_id, designation'),
  ])
  const designationBy = new Map((profiles ?? []).map((p) => [p.profile_id, p.designation]))

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={t('sa.gov.title', lang)}
        actions={
          <Link href="/super-admin" className="text-sm font-semibold text-brand-600 hover:underline">
            ← {t('sa.nav.dashboard', lang)}
          </Link>
        }
      />

      <section className="mt-6">
        <SectionCard title={t('sa.gov.create', lang)}>
          <CreateGovForm lang={lang} />
        </SectionCard>
      </section>

      <section className="mt-4">
        <SectionCard title={t('sa.gov.list', lang)} bodyClassName={officials?.length ? 'p-0' : 'p-4 sm:p-5'}>
          {!officials?.length ? (
            <p className="text-sm text-muted">{t('sa.gov.none', lang)}</p>
          ) : (
            <ul className="divide-y divide-line/70">
              {officials.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
                  <span className="min-w-0">
                    <span className="text-sm font-semibold">{o.full_name ?? o.id}</span>
                    {designationBy.get(o.id) && (
                      <span className="ml-2 text-xs text-muted">{designationBy.get(o.id)}</span>
                    )}
                  </span>
                  <Link
                    href={`/super-admin/gov-officials/${o.id}`}
                    className="shrink-0 rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
                  >
                    {t('sa.school.viewDetail', lang)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </section>
    </main>
  )
}
