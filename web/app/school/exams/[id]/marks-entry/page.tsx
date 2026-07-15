import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { subjectsForClass } from '@/lib/students'
import { loadGradingScheme } from '@/lib/grading-scheme-loader'
import { MarksEntryTable, SubjectPicker, type MarkStudentRow, type SubjectOption } from './marks-entry-controls'

// Layout per ui/school-owner/marks-entry.html: subject-picker toolbar over
// the Roll/Name/Theory/MCQ/Practical/Total/Grade table, one Save per subject.
// Grade comes from evaluateSubject (web/lib/grading.ts, issue #31) using the
// exam's picked grading scheme; "optional-subject rules" (grade deduction,
// conditional auto-pass) are handled at the overall-result level (Promotion
// page), not per-subject here — a subject's own pass/fail badge is always
// literal (matches the mockup, which doesn't distinguish optional subjects
// in this table either).

export default async function MarksEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ subject?: string }>
}) {
  const { id } = await params
  const { subject: subjectParam } = await searchParams
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: exam } = await supabase
    .from('exams')
    .select('id, name, exam_year, status, class_id, grading_scheme_id')
    .eq('id', id)
    .maybeSingle()
  if (!exam) notFound()
  const closed = exam.status === 'closed'
  const examLabel = `${exam.name} (${exam.exam_year})`

  const header = (
    <div className="mb-4 flex items-center justify-between">
      <h1 className="text-2xl font-extrabold">
        {t('markEntry.title', lang)} — {examLabel}
      </h1>
      <Link href={`/school/exams/${exam.id}`} aria-label={t('examSetup.title', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
    </div>
  )

  if (!exam.class_id) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">
        {header}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">
          {t('markEntry.noClassSet', lang)}
        </p>
      </main>
    )
  }

  const { data: cls } = await supabase.from('classes').select('name, section').eq('id', exam.class_id).maybeSingle()
  const { data: allSubjects } = await supabase
    .from('subjects')
    .select('id, name, class_id, theory_marks, mcq_marks, practical_marks')
    .order('name')
  const subjects = subjectsForClass(allSubjects ?? [], exam.class_id) as SubjectOption[]

  if (!subjects.length) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">
        {header}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">
          {t('markEntry.noSubjects', lang)}
        </p>
      </main>
    )
  }

  const selectedSubject = subjects.find((s) => s.id === subjectParam) ?? subjects[0]

  let studentsQuery = supabase
    .from('students')
    .select('id, full_name, roll_number')
    .eq('class_name', cls?.name ?? '')
    .is('archived_at', null)
    .order('roll_number', { ascending: true, nullsFirst: false })
  studentsQuery = cls?.section ? studentsQuery.eq('section', cls.section) : studentsQuery.is('section', null)

  const [{ data: students }, { data: marksRows }, { data: optionalRows }, scheme] = await Promise.all([
    studentsQuery,
    supabase
      .from('exam_marks')
      .select('student_id, theory_obtained, mcq_obtained, practical_obtained')
      .eq('exam_id', id)
      .eq('subject_id', selectedSubject.id),
    supabase.from('student_subjects').select('student_id, is_optional').eq('subject_id', selectedSubject.id),
    exam.grading_scheme_id ? loadGradingScheme(supabase, exam.grading_scheme_id) : Promise.resolve(null),
  ])

  if (!students?.length) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">
        {header}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">
          {t('markEntry.noStudents', lang)}
        </p>
      </main>
    )
  }

  const marksByStudent = new Map((marksRows ?? []).map((m) => [m.student_id, m]))
  const optionalByStudent = new Map((optionalRows ?? []).map((o) => [o.student_id, o.is_optional]))
  const rows: MarkStudentRow[] = students.map((s) => {
    const m = marksByStudent.get(s.id)
    return {
      id: s.id,
      roll_number: s.roll_number,
      full_name: s.full_name,
      theory: m ? Number(m.theory_obtained) : 0,
      mcq: m ? Number(m.mcq_obtained) : 0,
      practical: m ? Number(m.practical_obtained) : 0,
      isOptional: optionalByStudent.get(s.id) ?? false,
    }
  })

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      {header}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <SubjectPicker subjects={subjects} selectedId={selectedSubject.id} lang={lang} />
        {closed && <span className="text-xs text-alert-deep">{t('markEntry.closedNote', lang)}</span>}
      </div>

      {!exam.grading_scheme_id && <p className="mb-3 text-xs text-muted">{t('markEntry.noScheme', lang)}</p>}

      <section className="rounded-lg border border-line bg-paper p-4 shadow-card">
        <MarksEntryTable
          examId={exam.id}
          subject={selectedSubject}
          rows={rows}
          scheme={scheme}
          disabled={closed}
          lang={lang}
        />
      </section>
    </main>
  )
}
