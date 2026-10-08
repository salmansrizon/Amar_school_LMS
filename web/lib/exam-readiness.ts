// The one DB-touching companion to exam-setup.ts's pure publish/stage rules
// (same split as grading-scheme-loader.ts / grading.ts): how far one exam's
// marks entry has got, and whether its grading scheme can grade at all. Read
// by the setup page (status chip, publish dialog), the list's publish card and
// — again, server-side — by the publish action itself.
import type { createClient } from '@/lib/supabase/server'
import { subjectsForClass } from '@/lib/students'
import { tallyMarks, type PublishFacts } from '@/lib/exam-setup'
import { enrolledStudentIds, enrolledIdFilter } from '@/lib/school/offering-roster'
import { selectAllRows } from '@/lib/supabase/select-all'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/** The (student, subject) pairs that count as entered for one exam. A row with
 * a blank component (possible once migration 0223 makes them nullable) has a
 * null generated total and is not entered yet; before 0223 no total is null and
 * the filter changes nothing. */
function enteredMarks(supabase: SupabaseServerClient, examId: string, from: number, to: number) {
  return supabase.from('exam_marks').select('student_id, subject_id').eq('exam_id', examId).not('obtained_marks', 'is', null).order('id').range(from, to)
}

export interface ExamReadiness extends PublishFacts {
  /** exam_marks rows for the current roster × the class's subjects. */
  entered: number
  total: number
}

export async function loadExamReadiness(
  supabase: SupabaseServerClient,
  exam: { id: string; class_id: string | null; grading_scheme_id: string | null },
): Promise<ExamReadiness> {
  const [scheme, bands, enrolledIds, subjectRows, marks] = await Promise.all([
    exam.grading_scheme_id
      ? supabase.from('grading_schemes').select('scheme_type').eq('id', exam.grading_scheme_id).maybeSingle()
      : Promise.resolve({ data: null }),
    exam.grading_scheme_id
      ? supabase
          .from('grade_bands')
          .select('id', { count: 'exact', head: true })
          .eq('grading_scheme_id', exam.grading_scheme_id)
      : Promise.resolve({ count: 0 }),
    exam.class_id ? enrolledStudentIds(supabase, exam.class_id) : Promise.resolve([] as string[]),
    exam.class_id
      ? supabase.from('subjects').select('id, name, class_id')
      : Promise.resolve({ data: [] as { id: string; name: string; class_id: string | null }[] }),
    exam.class_id
      ? selectAllRows<{ student_id: string; subject_id: string }>((from, to) =>
          enteredMarks(supabase, exam.id, from, to),
        )
      : Promise.resolve({ rows: [] as { student_id: string; subject_id: string }[] }),
  ])

  // The same roster marks entry lists: currently enrolled, not archived.
  const { data: students } = exam.class_id
    ? await supabase.from('students').select('id').in('id', enrolledIdFilter(enrolledIds)).is('archived_at', null)
    : { data: [] as { id: string }[] }
  const studentIds = (students ?? []).map((s) => s.id)
  const subjectIds = exam.class_id ? subjectsForClass(subjectRows.data ?? [], exam.class_id).map((s) => s.id) : []
  const tally = tallyMarks(studentIds, subjectIds, new Set(marks.rows.map((m) => `${m.student_id}:${m.subject_id}`)))

  return {
    classSet: Boolean(exam.class_id),
    schemeType: scheme.data?.scheme_type ?? null,
    bandCount: bands.count ?? 0,
    students: studentIds.length,
    subjects: subjectIds.length,
    ...tally,
  }
}

/** Marks-entry progress for the exams list (#698): the SAME tally the publish
 * dialog shows — current roster × the class's subjects — so the two cannot
 * differ. A plain row count per exam also counted marks of students who left
 * the class and of subjects since removed.
 *
 * ponytail: reads each listed exam's (student, subject) pairs, one paged read
 * per exam. Move the tally into a database function if the list measures slow. */
export async function loadMarksProgress(
  supabase: SupabaseServerClient,
  exams: { id: string; class_id: string | null }[],
  subjects: { id: string; name: string; class_id: string | null }[],
): Promise<{ byExam: Map<string, { entered: number; total: number }>; rosterByClass: Map<string, number> }> {
  const classIds = [...new Set(exams.map((e) => e.class_id).filter((id): id is string => Boolean(id)))]
  const rosters = await Promise.all(
    classIds.map(async (cid) => {
      const enrolled = await enrolledStudentIds(supabase, cid)
      const { data } = await supabase.from('students').select('id').in('id', enrolledIdFilter(enrolled)).is('archived_at', null)
      return [cid, (data ?? []).map((s) => s.id as string)] as const
    }),
  )
  const rosterIds = new Map(rosters)
  const tallies = await Promise.all(
    exams.map(async (e) => {
      if (!e.class_id) return [e.id, { entered: 0, total: 0 }] as const
      const marks = await selectAllRows<{ student_id: string; subject_id: string }>((from, to) =>
        enteredMarks(supabase, e.id, from, to),
      )
      const { entered, total } = tallyMarks(
        rosterIds.get(e.class_id) ?? [],
        subjectsForClass(subjects, e.class_id).map((s) => s.id),
        new Set(marks.rows.map((m) => `${m.student_id}:${m.subject_id}`)),
      )
      return [e.id, { entered, total }] as const
    }),
  )
  return { byExam: new Map(tallies), rosterByClass: new Map(rosters.map(([cid, ids]) => [cid, ids.length])) }
}
