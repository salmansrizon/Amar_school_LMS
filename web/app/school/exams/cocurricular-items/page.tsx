import { currentLang } from '@/lib/i18n-server'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { t } from '@/lib/i18n'
import { ExamsTabs } from '../exams-tabs'
import { getSchoolContext } from '@/lib/school/context'
import { sortCocurricularItems } from '@/lib/cocurricular'
import { AddCocurricularItemForm, CocurricularItemsList } from './controls'
import { pageTitle } from '@/lib/page-title'

// Settings screen for the school-defined co-curricular activity list backing
// the progress report's Co-curricular Checklist section (issue #33,
// migration 0052) — the mockups don't show a management screen for this (no
// existing data model to reuse), so this follows the grading-schemes /
// combinations settings-page pattern already established in this module.

export const generateMetadata = pageTitle('cocurricular.itemsTitle')

export default async function CocurricularItemsPage() {
  const lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: items } = await supabase.from('cocurricular_items').select('id, label, sort_order')

  return (
    <div>
      <PageHeader
        title={`${t('cocurricular.itemsTitle', lang)}`}
        crumbs={schoolCrumbs('/school/exams', lang, { label: t('exams.title', lang), href: '/school/exams' }, { label: `${t('cocurricular.itemsTitle', lang)}` })}
      />

      <ExamsTabs active="/school/exams/cocurricular-items" lang={lang} />

      <section className="mb-6 rounded-2xl border border-line bg-paper p-card">
        <AddCocurricularItemForm lang={lang} />
      </section>

      <section className="rounded-2xl border border-line bg-paper p-card">
        <CocurricularItemsList items={sortCocurricularItems(items ?? [])} lang={lang} />
      </section>
    </div>
  )
}
