import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import type { LocationRow } from '@/lib/locations'
import { InstituteTabs } from './tabs'
import { ProfileForm } from './profile-form'

// Institute Profile (issue #39, PRD §5.11) per ui/school-owner/institute-profile.html.
// Address hierarchy + Cluster assignment reuse the existing schools.location_id /
// cluster_id columns (issue #1/#3) — the new columns here are the Bangladesh
// registration fields + education levels offered.

export default async function InstituteProfilePage() {
  const lang: Lang = await currentLang()
  const { supabase, role } = await getSchoolContext()

  const [{ data: school }, { data: locations }, { data: clusters }, { data: admitCardTheme }] = await Promise.all([
    supabase
      .from('schools')
      .select(
        'id, name, institute_code, eiin_no, mpo_enlisted, mpo_code, center_code, education_levels, location_id, cluster_id, address_line, mobile, email, logo_path, roll_number_increment',
      )
      .maybeSingle(),
    supabase.from('locations').select('id, name, type, parent_id').order('name'),
    supabase.from('clusters').select('id, name').order('name'),
    supabase
      .from('school_print_themes')
      .select('palette_key')
      .eq('doc_type', 'admit-card')
      .maybeSingle(),
  ])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('institute.title', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <InstituteTabs active="/school/institute" lang={lang} />

      <ProfileForm
        lang={lang}
        isOwner={role === 'school_owner'}
        school={school ?? null}
        locations={(locations ?? []) as LocationRow[]}
        clusters={clusters ?? []}
        admitCardTheme={admitCardTheme?.palette_key ?? null}
      />
    </div>
  )
}
