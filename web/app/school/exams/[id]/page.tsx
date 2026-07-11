import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { subjectsForClass } from '@/lib/students'
import {
  BasicInfoForm,
  ExamHeader,
  GradingSchemeSelect,
  SubjectTeacherTable,
  type ClassOption,
  type SchemeOption,
  type SubjectRow,
  type TeacherOption,
} from './setup-controls'

// Layout per ui/school-owner/exam-setup.html: Basic Info + Grading Scheme
// cards (the latter picks one of #31's reusable named schemes rather than
// re-entering its fields) over the Subject-Teacher Assignment table. Closing
// (issue #8) locks every field here — enforced server-side by the exam_close
// trigger + the new child-table guards (migration 0039), mirrored client-side
// by disabling the inputs.

export default async function ExamSetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: exam } = await supabase
    .from('exams')
    .select('id, name, exam_year, status, class_id, start_date, grading_scheme_id')
    .eq('id', id)
    .maybeSingle()
  if (!exam) notFound()
  const closed = exam.status === 'closed'

  const [{ data: classes }, { data: schemes }, { data: allSubjects }, { data: assignments }, { data: teachers }] =
    await Promise.all([
      supabase.from('classes').select('id, name, section').order('created_at'),
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
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">
          {t('examSetup.title', lang)} — {examLabel}
        </h1>
        <Link href="/school/exams" className="text-sm text-brand-600 hover:underline">
          ← {t('exams.title', lang)}
        </Link>
      </div>

      <ExamHeader examId={exam.id} examLabel={examLabel} closed={closed} lang={lang} />

      <section className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h3 className="mb-3 font-bold">{t('examSetup.basicInfo', lang)}</h3>
        <BasicInfoForm
          examId={exam.id}
          name={exam.name}
          examYear={exam.exam_year}
          classId={exam.class_id}
          startDate={exam.start_date}
          classes={(classes ?? []) as ClassOption[]}
          disabled={closed}
          lang={lang}
        />
      </section>

      <section className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h3 className="mb-3 font-bold">{t('examSetup.gradingScheme', lang)}</h3>
        <GradingSchemeSelect
          examId={exam.id}
          schemeId={exam.grading_scheme_id}
          schemes={(schemes ?? []) as SchemeOption[]}
          disabled={closed}
          lang={lang}
        />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
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
        <div className="mt-4 flex gap-2">
          <Link
            href={`/school/exams/${exam.id}/seat-plan`}
            className="rounded-full border border-line-strong px-4 py-1.5 text-sm font-semibold hover:bg-paper-muted"
          >
            {t('examSetup.nextSeatPlan', lang)}
          </Link>
        </div>
      </section>
    </main>
  )
}
