import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { NoticeTabs } from '../notice-tabs'
import { CreateNoticeForm } from './create-form'
import { classNamesFor, sectionsForClass } from '@/lib/students'
import { classCatalogueOptions } from '@/lib/class-catalogue'

// Layout per ui/school-owner/notice-create.html: Type/Importance/Title, a
// Target Audience selector that reveals Class/Section pickers when
// "Specific" is chosen, Content, and optional Image/Link.
export default async function CreateNoticePage() {
  const lang: Lang = await currentLang()
  const { supabase, shiftSelection } = await getSchoolContext()

  const [{ data: classes }] = await Promise.all([
    applyGlobalShiftFilterToOfferings(
      supabase.from('class_offerings').select('id, name, section').order('name'),
      shiftSelection,
    ),
  ])
  // One catalogue derivation, shared by both — not two independent
  // class_offerings-shaped queries (map #568/#582, Wave 4a Part B).
  const catalogue = classCatalogueOptions(classes ?? [])
  const classNames = classNamesFor(catalogue)
  const sections = sectionsForClass(catalogue, '')

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('notices.tabCreate', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>
      <NoticeTabs active="create" lang={lang} />
      <CreateNoticeForm lang={lang} classNames={classNames} sections={sections} />
    </div>
  )
}
