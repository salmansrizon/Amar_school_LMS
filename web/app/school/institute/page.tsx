import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import type { LocationRow } from '@/lib/locations'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { InstituteTabs } from './tabs'
import { ProfileForm } from './profile-form'
import { AcademicYearCard } from './academic-year-card'
import { pageTitle } from '@/lib/page-title'

// Institute Profile (issue #39, PRD §5.11) per ui/school-owner/institute-profile.html,
// laid out as the sectioned settings page of new_ui/05-administration (map 013, AD1).
// Address hierarchy + Cluster assignment reuse the existing schools.location_id /
// cluster_id columns (issue #1/#3) — the new columns here are the Bangladesh
// registration fields + education levels offered.

export const generateMetadata = pageTitle('institute.title')

export default async function InstituteProfilePage({
  searchParams,
}: {
  // `?section=roll-numbering` (issue #629) — New Student Admission's Roll
  // helper text links here to bring the Roll Numbering panel into view.
  searchParams: Promise<{ section?: string }>
}) {
  const lang: Lang = await currentLang()
  const { section } = await searchParams
  const { supabase, role } = await getSchoolContext()

  const [{ data: school }, { data: locations }, { data: clusters }, { data: admitCardTheme }] = await Promise.all([
    supabase
      .from('schools')
      .select(
        'id, name, institute_code, eiin_no, mpo_enlisted, mpo_code, center_code, education_levels, location_id, cluster_id, address_line, mobile, email, logo_path, roll_number_increment, configured_shifts, active_academic_year',
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
    <>
      <PageHeader
        title={t('institute.title', lang)}
        subtitle={t('institute.pageSubtitle', lang)}
        crumbs={schoolCrumbs('/school/institute', lang, { label: t('institute.title', lang) })}
      />

      <InstituteTabs active="/school/institute" lang={lang} />

      <ProfileForm
        lang={lang}
        isOwner={role === 'school_owner'}
        school={school ?? null}
        locations={(locations ?? []) as LocationRow[]}
        clusters={clusters ?? []}
        admitCardTheme={admitCardTheme?.palette_key ?? null}
        highlightSection={section}
      />

      <AcademicYearCard lang={lang} isOwner={role === 'school_owner'} currentYear={school?.active_academic_year ?? null} />
    </>
  )
}
