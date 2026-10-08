import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { currentLang } from '@/lib/i18n-server'
import { t, formatNumber, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { mayActOnExamClass } from '@/lib/school/exam-class-guard'
import { examBasicInfoComplete, examChip, examStage, publishMarksComplete, schemeHasUsableBands } from '@/lib/exam-setup'
import { loadExamReadiness } from '@/lib/exam-readiness'
import { schoolToday } from '@/lib/school-time'
import { applyGlobalYearFilterToOfferings } from '@/lib/school/year-filter'
import { excludeArchivedOfferings } from '@/lib/school/archived-offerings-filter'
import { subjectsForClass } from '@/lib/students'
import {
  BasicInfoForm,
  ExamHeader,
  GradingSchemeSelect,
  SubjectTeacherTable,
  type SchemeOption,
  type SubjectRow,
  type TeacherOption,
} from './setup-controls'
import { resolveBackHref, selfOrigin } from '@/lib/back-nav'
import type { ClassCatalogueRow } from '@/lib/class-catalogue'
import { PublishResults } from './publish-results'

// Layout per ui/school-owner/exam-setup.html: Basic Info + Grading Scheme
// cards (the latter picks one of #31's reusable named schemes rather than
// re-entering its fields) over the Subject-Teacher Assignment table. Closing
// (issue #8) locks every field here — enforced server-side by the exam_close
// trigger + the new child-table guards (migration 0039), mirrored client-side
// by disabling the inputs.
//
// Map #366 made this the focused exam-configuration page: the Exam Documents
// index card and the "next: seat plan" hand-off both moved out, leaving only
// the three config cards. The documents are reachable from the header's
// Documents button (exam-documents-modal.tsx) and from the exam row.

const examLabelOf = (e: { name: string; exam_year: number }, lang: Lang) =>
  `${e.name} (${formatNumber(e.exam_year, lang, { useGrouping: false })})`

// The same string the page heading shows.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()
  const { data: exam } = await supabase.from('exams').select('name, exam_year').eq('id', id).maybeSingle()
  return { title: exam ? `${t('examSetup.title', lang)} — ${examLabelOf(exam, lang)}` : t('examSetup.title', lang) }
}

export default async function ExamSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string | string[] }>
}) {
  const { id } = await params
  const { from } = await searchParams
  const backHref = resolveBackHref(from, '/school/exams')
  const lang: Lang = await currentLang()
  const { supabase, startedAcademicYears, academicYearSelection } = await getSchoolContext()
  // Started-year history is the signal (#609/#612), same boolean T6/#615
  // threaded into the Fee Structures Offering picker.
  const showYear = startedAcademicYears.length > 1

  const { data: exam } = await supabase
    .from('exams')
    .select('id, name, exam_year, status, class_id, start_date, grading_scheme_id, results_published_at')
    .eq('id', id)
    .maybeSingle()
  if (!exam) notFound()
  const closed = exam.status === 'closed'
  // #676: another class's exam is read-only to a class-attached teacher — the
  // same answer the server actions give, asked once here.
  const notMine = !(await mayActOnExamClass(supabase, exam.id))
  const readOnly = closed || notMine

  const [
    { data: classes },
    { data: schemes },
    { data: allSubjects },
    { data: assignments },
    { data: teachers },
    readiness,
    { data: lastSitting },
  ] = await Promise.all([
      // Basic Info's Class picker excludes archived Offerings for NEW picks
      // (ADR 0024) — the exam's own current selection is preserved below
      // regardless, so an exam already pointing at a since-archived class
      // doesn't silently blank out and null class_id on the next save.
      applyGlobalYearFilterToOfferings(
        excludeArchivedOfferings(
          supabase
            .from('class_offerings')
            .select('id, name, section, group_department, shift, academic_year')
            .order('created_at'),
        ),
        academicYearSelection,
      ),
      // The band count rides along so the picker can warn about a scheme that
      // cannot grade (audit AC6) — one embedded count, not a query per scheme.
      supabase.from('grading_schemes').select('id, name, scheme_type, grade_bands(count)').order('name'),
      supabase.from('subjects').select('id, name, class_id, theory_marks, mcq_marks, practical_marks').order('name'),
      supabase.from('exam_subject_teachers').select('subject_id, teacher_id').eq('exam_id', id),
      supabase.from('employee_card').select('id, full_name').is('archived_at', null).order('full_name'),
      loadExamReadiness(supabase, exam),
      supabase
        .from('exam_routine_entries')
        .select('exam_date')
        .eq('exam_id', id)
        .order('exam_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  // The same stage the exams list shows for this exam — one classifier
  // (examStage), fed the same two facts, so the two screens cannot disagree.
  const chip = examChip(
    examStage(exam, schoolToday(), {
      marksComplete: publishMarksComplete(readiness),
      lastExamDate: lastSitting?.exam_date ?? null,
    }),
    exam.results_published_at,
  )
  const schemeOptions: SchemeOption[] = (schemes ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    usable: schemeHasUsableBands(s.scheme_type, s.grade_bands[0]?.count ?? 0),
  }))

  let classOptions = classes ?? []
  if (exam.class_id && !classOptions.some((c) => c.id === exam.class_id)) {
    const { data: currentClass } = await supabase
      .from('class_offerings')
      .select('id, name, section, group_department, shift, academic_year')
      .eq('id', exam.class_id)
      .maybeSingle()
    if (currentClass) classOptions = [...classOptions, currentClass]
  }

  const teacherBySubject = new Map((assignments ?? []).map((a) => [a.subject_id, a.teacher_id]))
  const subjectRows: SubjectRow[] = exam.class_id
    ? subjectsForClass(allSubjects ?? [], exam.class_id).map((s) => ({
        id: s.id,
        name: s.name,
        theory_marks: s.theory_marks,
        mcq_marks: s.mcq_marks,
        practical_marks: s.practical_marks,
        teacher_id: teacherBySubject.get(s.id) ?? null,
      }))
    : []

  const examLabel = examLabelOf(exam, lang)

  return (
    <div>
      {notMine ? (
        <p className="mb-3 text-xs text-alert-deep">{t('exams.notYourClass', lang)}</p>
      ) : (
        <PublishResults lang={lang} examId={exam.id} publishedAt={exam.results_published_at} facts={readiness} />
      )}
      <PageHeader
        title={`${t('examSetup.title', lang)} — ${examLabel}`}
        crumbs={schoolCrumbs('/school/exams', lang, { label: t('exams.title', lang), href: '/school/exams' }, { label: `${t('examSetup.title', lang)} — ${examLabel}` })}
        backHref={backHref}
        backLabel={t('common.back', lang)}
      />

      <ExamHeader
        examId={exam.id}
        examLabel={examLabel}
        closed={readOnly}
        chip={chip}
        basicInfoComplete={examBasicInfoComplete(exam)}
        selfHref={selfOrigin(`/school/exams/${id}`, from)}
        lang={lang}
      />

      <section className="mb-4 rounded-2xl border border-line bg-paper p-card">
        <h3 className="mb-3 font-bold">{t('examSetup.basicInfo', lang)}</h3>
        <BasicInfoForm
          examId={exam.id}
          name={exam.name}
          examYear={exam.exam_year}
          classId={exam.class_id}
          startDate={exam.start_date}
          classes={classOptions as ClassCatalogueRow[]}
          disabled={readOnly}
          lang={lang}
          showYear={showYear}
        />
      </section>

      <section className="mb-4 rounded-2xl border border-line bg-paper p-card">
        <h3 className="mb-3 font-bold">{t('examSetup.gradingScheme', lang)}</h3>
        <GradingSchemeSelect
          examId={exam.id}
          schemeId={exam.grading_scheme_id}
          schemes={schemeOptions}
          disabled={readOnly}
          lang={lang}
        />
      </section>

      <section className="rounded-2xl border border-line bg-paper p-card">
        <h3 className="mb-3 font-bold">{t('examSetup.subjectTeacher', lang)}</h3>
        {!exam.class_id ? (
          <p className="text-sm text-muted">{t('examSetup.noClassSet', lang)}</p>
        ) : !subjectRows.length ? (
          <p className="text-sm text-muted">{t('examSetup.noSubjects', lang)}</p>
        ) : (
          <SubjectTeacherTable
            examId={exam.id}
            subjects={subjectRows}
            teachers={(teachers ?? []) as TeacherOption[]}
            disabled={readOnly}
            lang={lang}
          />
        )}
      </section>
    </div>
  )
}
