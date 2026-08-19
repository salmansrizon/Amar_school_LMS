import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { AddExamForm, ExamsListClient } from './exam-controls'
import { ExamsTabs } from './exams-tabs'
import { BackLink } from '@/components/back-link'

// Layout per ui/school-owner/exams-list.html: search + class/status filter
// toolbar, "+ New Exam" quick-create (name/year only — full setup happens on
// the detail page, [id]/page.tsx), table of exams. Map #366 gives every row the
// same four actions (Basic Info / Mark Entry / Co-Curricular / Documents);
// grading_scheme_id rides along because two of them are gated on it.

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
      .order('created_at', { ascending: false }),
    supabase.from('classes').select('id, name, section').order('created_at'),
  ])

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('exams.title', lang)}</h1>
        <BackLink href="/school" label={t('common.back', lang)} />
      </div>

      <ExamsTabs active="/school/exams" lang={lang} />

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('exams.add', lang)}</h2>
        <AddExamForm lang={lang} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
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
    </main>
  )
}
