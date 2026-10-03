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
          supabase.from('exam_marks').select('student_id, subject_id').eq('exam_id', exam.id).order('id').range(from, to),
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
