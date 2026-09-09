import Link from 'next/link'
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
  const offerings = (allOfferings ?? []).filter(
    (o) => activeAcademicYear === null || o.academic_year === activeAcademicYear,
  )

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('notices.tabCreate', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>
      <NoticeTabs active="create" lang={lang} />
      <CreateNoticeForm lang={lang} offerings={offerings} activeAcademicYear={activeAcademicYear} />
    </div>
  )
}
