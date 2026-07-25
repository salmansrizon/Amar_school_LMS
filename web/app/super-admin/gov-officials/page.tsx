import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { CreateGovForm } from './create-gov-form'

// Government Officials management (map #158, ticket #164) — distinct from the
// dealer/partner list. Lists gov_official accounts with their designation; the
// detail page edits designation, education scope and territory assignments.
export default async function GovOfficialsPage() {
  const lang = await currentLang()
  const { supabase } = await getSuperAdminContext()

  const [{ data: officials }, { data: profiles }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('role', 'gov_official').order('created_at'),
    supabase.from('gov_official_profiles').select('profile_id, designation'),
  ])
  const designationBy = new Map((profiles ?? []).map((p) => [p.profile_id, p.designation]))

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('sa.gov.title', lang)}</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← {t('sa.nav.dashboard', lang)}
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('sa.gov.create', lang)}</h2>
        <CreateGovForm lang={lang} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('sa.gov.list', lang)}</h2>
        {!officials?.length ? (
          <p className="text-sm text-muted">{t('sa.gov.none', lang)}</p>
        ) : (
          <ul className="divide-y divide-line">
            {officials.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="text-sm font-medium">{o.full_name ?? o.id}</span>
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
      </section>
    </main>
  )
}
