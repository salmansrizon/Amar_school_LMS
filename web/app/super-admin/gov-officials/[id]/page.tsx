import Link from 'next/link'
import { notFound } from 'next/navigation'
import { type LocationRow } from '@/lib/locations'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { AddAssignmentForm } from '../../partners/[id]/assignment-controls'
import { AssignmentList, type AssignmentRow } from '../../partners/[id]/assignment-list'
import { GovProfileForm } from './gov-profile-form'

// Government Official detail (map #158, ticket #164): profile (designation +
// education-level scope) plus territory assignments, reusing the dealer/partner
// assignment UI (add form + list with the extended-access badge).
export default async function GovOfficialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang = await currentLang()
  const { supabase } = await getSuperAdminContext()

  const { data: official } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', id)
    .eq('role', 'gov_official')
    .maybeSingle()
  if (!official) notFound()

  const [{ data: govProfile }, { data: assignments }, { data: locations }, { data: schools }] = await Promise.all([
    supabase
      .from('gov_official_profiles')
      .select('designation, education_level_scope')
      .eq('profile_id', id)
      .maybeSingle(),
    supabase
      .from('territory_assignments')
      .select('id, tier, locations(name, type), schools(name)')
      .eq('assignee_id', id)
      .order('created_at'),
    supabase.from('locations').select('id, name, type, parent_id').order('name'),
    supabase.from('schools').select('id, name').order('name'),
  ])

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{official.full_name ?? official.id}</h1>
        <Link href="/super-admin/gov-officials" className="text-sm text-brand-600 hover:underline">
          ← {t('sa.gov.backToList', lang)}
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('sa.gov.profile', lang)}</h2>
        <GovProfileForm
          profileId={official.id}
          designation={govProfile?.designation ?? null}
          scope={govProfile?.education_level_scope ?? []}
          lang={lang}
        />
      </section>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('sa.gov.territory', lang)}</h2>
        <AddAssignmentForm
          assigneeId={official.id}
          isDistributor={false}
          locations={(locations ?? []) as LocationRow[]}
          schools={schools ?? []}
          lang={lang}
        />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <AssignmentList assignments={(assignments ?? []) as AssignmentRow[]} assigneeId={official.id} lang={lang} />
      </section>
    </main>
  )
}
