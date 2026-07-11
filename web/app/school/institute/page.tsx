import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import type { LocationRow } from '@/lib/locations'
import { InstituteTabs } from './tabs'
import { ProfileForm } from './profile-form'

// Institute Profile (issue #39, PRD §5.11) per ui/school-owner/institute-profile.html.
// Address hierarchy + Cluster assignment reuse the existing schools.location_id /
// cluster_id columns (issue #1/#3) — the new columns here are the Bangladesh
// registration fields + education levels offered.

export default async function InstituteProfilePage() {
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: school }, { data: locations }, { data: clusters }] = await Promise.all([
    supabase
      .from('schools')
      .select(
        'id, name, institute_code, eiin_no, mpo_enlisted, mpo_code, center_code, education_levels, location_id, cluster_id',
      )
      .maybeSingle(),
    supabase.from('locations').select('id, name, type, parent_id').order('name'),
    supabase.from('clusters').select('id, name').order('name'),
  ])

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('institute.title', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>

      <InstituteTabs active="/school/institute" lang={lang} />

      <ProfileForm
        lang={lang}
        isOwner={me?.role === 'school_owner'}
        school={school ?? null}
        locations={(locations ?? []) as LocationRow[]}
        clusters={clusters ?? []}
      />
    </main>
  )
}
