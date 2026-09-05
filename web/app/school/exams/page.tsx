import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { AddExamForm, ExamsListClient } from './exam-controls'
import { ExamsTabs } from './exams-tabs'
import { BackLink } from '@/components/back-link'

// Layout per ui/school-owner/exams-list.html: search + class/status filter
// toolbar, "+ New Exam" quick-create (name/year only — full setup happens on
// the detail page, [id]/page.tsx), table of exams. Map #366 cut every row to
// four actions; map #373 restored Seat Plan and Routine, so there are now six
// (docs/010_exam_module.md §1). grading_scheme_id rides along because Marks
// Entry and Documents are gated on it, while Co-Curricular, Seat Plan and
// Routine need only the class.

export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; class?: string; status?: string; exam?: string }>
}) {
  const lang = await currentLang()
  // Returning from a destination restores the list it was opened from: the
  // filters as they were, and the row that launched it (docs/010_exam_module.md
  // §5 — "returning merely to the Exams & Results URL is not sufficient").
  const { q = '', class: classParam = '', status: statusParam = '', exam: anchorExamId } = await searchParams
  const { supabase } = await getSchoolContext()

  const [{ data: exams }, { data: classes }] = await Promise.all([
    supabase
      .from('exams')
      .select('id, name, exam_year, status, class_id, grading_scheme_id, start_date')
      .order('created_at', { ascending: false })
      // ponytail: newest 500. A school runs a handful of exams a year, and the
      // filters below are client-side over what arrives — so this is a guard
      // against an unbounded read (#546), not a paging scheme. If a school ever
      // reaches 500 exams, the filters move to the server (#550).
      .limit(500),
    supabase.from('class_offerings').select('id, name, section, group_department').order('created_at'),
  ])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('exams.title', lang)}</h1>
        <BackLink href="/school" label={t('common.back', lang)} />
      </div>

      <ExamsTabs active="/school/exams" lang={lang} />

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">{t('exams.add', lang)}</h2>
        <AddExamForm lang={lang} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5">
        {/* Keyed on the restored context so a soft navigation back here
            remounts the list with those filters, rather than reusing the
            instance and its now-stale useState seeds. */}
        <ExamsListClient
          key={`${q}|${classParam}|${statusParam}|${anchorExamId ?? ''}`}
          exams={exams ?? []}
          classes={classes ?? []}
          initialQuery={q}
          initialClassId={classParam}
          initialStatus={statusParam}
          anchorExamId={anchorExamId}
          lang={lang}
        />
      </section>

      <p className="mt-3 text-xs text-muted">{t('exams.closedNote', lang)}</p>
    </div>
  )
}
