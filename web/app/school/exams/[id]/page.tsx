import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { examBasicInfoComplete } from '@/lib/exam-setup'
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
import { BackLink } from '@/components/back-link'
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
  const { supabase } = await getSchoolContext()

  const { data: exam } = await supabase
    .from('exams')
    .select('id, name, exam_year, status, class_id, start_date, grading_scheme_id, results_published_at')
    .eq('id', id)
    .maybeSingle()
  if (!exam) notFound()
  const closed = exam.status === 'closed'

  const [{ data: classes }, { data: schemes }, { data: allSubjects }, { data: assignments }, { data: teachers }] =
    await Promise.all([
      supabase.from('classes').select('id, name, section, group_department').order('created_at'),
      supabase.from('grading_schemes').select('id, name').order('name'),
      supabase.from('subjects').select('id, name, class_id, theory_marks, mcq_marks, practical_marks').order('name'),
      supabase.from('exam_subject_teachers').select('subject_id, teacher_id').eq('exam_id', id),
      supabase.from('employees').select('id, full_name').is('archived_at', null).order('full_name'),
    ])

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

  const examLabel = `${exam.name} (${exam.exam_year})`

  return (
    <div>
      <PublishResults lang={lang} examId={exam.id} publishedAt={exam.results_published_at} />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">
          {t('examSetup.title', lang)} — {examLabel}
        </h1>
        <BackLink href={backHref} label={t('common.back', lang)} />
      </div>

      <ExamHeader
        examId={exam.id}
        examLabel={examLabel}
        closed={closed}
        basicInfoComplete={examBasicInfoComplete(exam)}
        selfHref={selfOrigin(`/school/exams/${id}`, from)}
        lang={lang}
      />

      <section className="mb-4 rounded-lg border border-line bg-paper p-5">
        <h3 className="mb-3 font-bold">{t('examSetup.basicInfo', lang)}</h3>
        <BasicInfoForm
          examId={exam.id}
          name={exam.name}
          examYear={exam.exam_year}
          classId={exam.class_id}
          startDate={exam.start_date}
          classes={(classes ?? []) as ClassCatalogueRow[]}
          disabled={closed}
          lang={lang}
        />
      </section>

      <section className="mb-4 rounded-lg border border-line bg-paper p-5">
        <h3 className="mb-3 font-bold">{t('examSetup.gradingScheme', lang)}</h3>
        <GradingSchemeSelect
          examId={exam.id}
          schemeId={exam.grading_scheme_id}
          schemes={(schemes ?? []) as SchemeOption[]}
          disabled={closed}
          lang={lang}
        />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5">
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
            disabled={closed}
            lang={lang}
          />
        )}
      </section>
    </div>
  )
}
