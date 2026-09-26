import { PageHeader } from '@/components/ui/page'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { NoticeTabs } from '../notice-tabs'
import { CreateNoticeForm } from './create-form'

// Layout per ui/school-owner/notice-create.html: Type/Importance/Title, a
// Target Audience selector that reveals the Class-Catalogue-backed picker when
// a non-"All" scope is chosen (map #598 Wave 6, #607 -- All / exact Class
// Offering / broadcast), Content, and optional Image/Link.
export default async function CreateNoticePage() {
  const lang: Lang = await currentLang()
  const { supabase, schoolId } = await getSchoolContext()

  const [{ data: allOfferings }, { data: school }] = await Promise.all([
    supabase
      .from('class_offerings')
      .select('id, name, section, group_department, shift, academic_year')
      .order('name'),
    supabase.from('schools').select('active_academic_year').eq('id', schoolId).maybeSingle(),
  ])
  const activeAcademicYear = (school?.active_academic_year ?? null) as number | null
  // Only active-year Offerings can hold a current Enrollment, and the Class
  // Catalogue label omits the year -- a past-year Offering in the picker would
  // be indistinguishable from the current one and resolve to nobody. Drop them
  // (keep all only when no active year is set yet). Mirrors SMS compose (map
  // #598 Wave 5, #606).
  //
  // Deliberately NOT wired to the Global Academic Year Selection (map #609,
  // T6/#615): that is a browse/management visibility preference. Targeting
  // stays pinned to `active_academic_year` by business rule -- a broader
  // "visible years" set must never widen who a notice can reach.
  const offerings = (allOfferings ?? []).filter(
    (o) => activeAcademicYear === null || o.academic_year === activeAcademicYear,
  )

  return (
    <>
      <PageHeader
        title={t('notices.tabCreate', lang)}
        crumbs={schoolCrumbs('/school/notices/new', lang, [
          { label: t('notices.title', lang), href: '/school/notices' },
          { label: t('notices.tabCreate', lang) },
        ])}
      />
      <NoticeTabs active="create" lang={lang} />
      <CreateNoticeForm lang={lang} offerings={offerings} activeAcademicYear={activeAcademicYear} />
    </>
  )
}
