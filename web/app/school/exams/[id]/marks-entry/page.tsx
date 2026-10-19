import { notFound } from 'next/navigation'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { mayEnterExamMarks } from '@/lib/school/exam-class-guard'
import { subjectsForClass } from '@/lib/students'
import { loadGradingScheme } from '@/lib/grading-scheme-loader'
import { enrolledStudentIds, enrolledIdFilter } from '@/lib/school/offering-roster'
import { MarksEntryTable, SubjectPicker, type MarkStudentRow, type SubjectOption } from './marks-entry-controls'
import { resolveBackHref } from '@/lib/back-nav'
import { isMissingColumnError } from '@/lib/leave-columns'

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
  searchParams: Promise<{ subject?: string; from?: string | string[] }>
}) {
  const { id } = await params
  const { subject: subjectParam, from } = await searchParams
  const backHref = resolveBackHref(from, `/school/exams/${id}`)
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: exam } = await supabase
    .from('exams')
    .select('id, name, exam_year, status, class_id, grading_scheme_id')
    .eq('id', id)
    .maybeSingle()
  if (!exam) notFound()
  const closed = exam.status === 'closed'
  const examLabel = `${exam.name} (${exam.exam_year})`

  const header = (
    <PageHeader
      title={`${t('markEntry.title', lang)} — ${examLabel}`}
      crumbs={schoolCrumbs('/school/exams', lang, { label: t('exams.title', lang), href: '/school/exams' }, { label: `${t('markEntry.title', lang)} — ${examLabel}` })}
      backHref={backHref}
      backLabel={t('common.back', lang)}
    />
  )

  if (!exam.class_id) {
    return (
      <div>
        {header}
        <p className="rounded-2xl border border-line bg-paper p-card text-sm text-muted">
          {t('markEntry.noClassSet', lang)}
        </p>
      </div>
    )
  }

  const { data: allSubjects } = await supabase
    .from('subjects')
    .select('id, name, class_id, theory_marks, mcq_marks, practical_marks')
    .order('name')
  const subjects = subjectsForClass(allSubjects ?? [], exam.class_id) as SubjectOption[]

  if (!subjects.length) {
    return (
      <div>
        {header}
        <p className="rounded-2xl border border-line bg-paper p-card text-sm text-muted">
          {t('markEntry.noSubjects', lang)}
        </p>
      </div>
    )
  }

  const selectedSubject = subjects.find((s) => s.id === subjectParam) ?? subjects[0]

  // Roster resolved through the current Enrollment's Class Offering, not a
  // class_name/section text match — since #593 two Offerings can share that
  // pair and a text match would merge both shifts' students (issue #596).
  const enrolledIds = await enrolledStudentIds(supabase, exam.class_id)
  const studentsQuery = supabase
    .from('students')
    .select('id, full_name, roll_number')
    .in('id', enrolledIdFilter(enrolledIds))
    .is('archived_at', null)
    .order('roll_number', { ascending: true, nullsFirst: false })

  // Migration 0223 adds is_absent (and lets a component be null). Until it is
  // applied the column is missing: read without it, and the grid offers
  // neither "absent" nor a half-filled row — what it did before.
  type SavedMark = {
    student_id: string
    theory_obtained: number | null
    mcq_obtained: number | null
    practical_obtained: number | null
    is_absent?: boolean
  }
  const MARK_COLUMNS = 'student_id, theory_obtained, mcq_obtained, practical_obtained'
  const readMarks = (columns: string) =>
    supabase.from('exam_marks').select(columns).eq('exam_id', id).eq('subject_id', selectedSubject.id).range(0, 4999)
  const loadMarks = async () => {
    const withAbsent = await readMarks(`${MARK_COLUMNS}, is_absent`)
    if (!isMissingColumnError(withAbsent.error)) {
      return { marksRows: withAbsent.data as unknown as SavedMark[] | null, absentSupported: !withAbsent.error }
    }
    return { marksRows: (await readMarks(MARK_COLUMNS)).data as unknown as SavedMark[] | null, absentSupported: false }
  }

  const [{ data: students }, { marksRows, absentSupported }, { data: optionalRows }, scheme] = await Promise.all([
    studentsQuery,
    loadMarks(),
    supabase.from('student_subjects').select('student_id, is_optional').eq('subject_id', selectedSubject.id),
    exam.grading_scheme_id ? loadGradingScheme(supabase, exam.grading_scheme_id) : Promise.resolve(null),
  ])

  if (!students?.length) {
    return (
      <div>
        {header}
        <p className="rounded-2xl border border-line bg-paper p-card text-sm text-muted">
          {t('markEntry.noStudents', lang)}
        </p>
      </div>
    )
  }

  const marksByStudent = new Map((marksRows ?? []).map((m) => [m.student_id, m]))
  const optionalByStudent = new Map((optionalRows ?? []).map((o) => [o.student_id, o.is_optional]))
  // No exam_marks row means the mark was never entered: the cells start blank,
  // not 0 (audit AC3). A component the subject does not have stays blank too.
  // A null component (0223) is one not entered yet, and an absent row shows
  // its tick, not the zeros it is stored as.
  const cell = (saved: number | string | null | undefined, max: number) =>
    saved !== undefined && saved !== null && max > 0 ? String(Number(saved)) : ''
  const rows: MarkStudentRow[] = students.map((s) => {
    const saved = marksByStudent.get(s.id)
    const absent = saved?.is_absent === true
    const m = absent ? undefined : saved
    return {
      id: s.id,
      roll_number: s.roll_number,
      full_name: s.full_name,
      theory: cell(m?.theory_obtained, selectedSubject.theory_marks),
      mcq: cell(m?.mcq_obtained, selectedSubject.mcq_marks),
      practical: cell(m?.practical_obtained, selectedSubject.practical_marks),
      absent,
      isOptional: optionalByStudent.get(s.id) ?? false,
    }
  })

  // #676: read-only unless this is her class's exam or she is the teacher the
  // exam names for this subject — the same answer saveMarks gives.
  const notMine = !(await mayEnterExamMarks(supabase, exam.id, selectedSubject.id))

  return (
    <div>
      {header}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <SubjectPicker subjects={subjects} selectedId={selectedSubject.id} lang={lang} />
        {closed && <span className="text-xs text-alert-deep">{t('markEntry.closedNote', lang)}</span>}
        {notMine && <span className="text-xs text-alert-deep">{t('exams.notYourClass', lang)}</span>}
      </div>

      {!exam.grading_scheme_id && <p className="mb-3 text-xs text-muted">{t('markEntry.noScheme', lang)}</p>}

      <section className="rounded-2xl border border-line bg-paper p-card">
        <MarksEntryTable
          // One subject's grid per mount: its typed-but-unsaved state must not
          // carry over to the next subject's students.
          key={selectedSubject.id}
          examId={exam.id}
          subject={selectedSubject}
          rows={rows}
          scheme={scheme}
          disabled={closed || notMine}
          absentSupported={absentSupported}
          lang={lang}
        />
      </section>
    </div>
  )
}
