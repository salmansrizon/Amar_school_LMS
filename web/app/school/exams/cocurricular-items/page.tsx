import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { ExamsTabs } from '../exams-tabs'
import { getSchoolContext } from '@/lib/school/context'
import { sortCocurricularItems } from '@/lib/cocurricular'
import { AddCocurricularItemForm, CocurricularItemsList } from './controls'
import { BackLink } from '@/components/back-link'

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
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('cocurricular.itemsTitle', lang)}</h1>
        <BackLink href="/school/exams" label={t('exams.title', lang)} />
      </div>

      <ExamsTabs active="/school/exams/cocurricular-items" lang={lang} />

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <AddCocurricularItemForm lang={lang} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5">
        <CocurricularItemsList items={sortCocurricularItems(items ?? [])} lang={lang} />
      </section>
    </div>
  )
}
