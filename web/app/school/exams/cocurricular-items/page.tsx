import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { ExamsTabs } from '../exams-tabs'
import { getSchoolContext } from '@/lib/school/context'
import { sortCocurricularItems } from '@/lib/cocurricular'
import { AddCocurricularItemForm, CocurricularItemsList } from './controls'

// Settings screen for the school-defined co-curricular activity list backing
// the progress report's Co-curricular Checklist section (issue #33,
// migration 0052) — the mockups don't show a management screen for this (no
// existing data model to reuse), so this follows the grading-schemes /
// combinations settings-page pattern already established in this module.

export default async function CocurricularItemsPage() {
  const lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: items } = await supabase.from('cocurricular_items').select('id, label, sort_order')

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('cocurricular.itemsTitle', lang)}</h1>
        <Link href="/school/exams" aria-label={t('exams.title', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <ExamsTabs active="/school/exams/cocurricular-items" lang={lang} />

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <AddCocurricularItemForm lang={lang} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <CocurricularItemsList items={sortCocurricularItems(items ?? [])} lang={lang} />
      </section>
    </main>
  )
}
