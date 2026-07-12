// Exams IV (issue #33, PRD §5.5): shared DB-touching loader for the mark-
// sheet and progress-report printables — both need the exact same "one exam
// + one student" result shape (per-subject grades via grading.ts, an overall
// pass/fail/GPA verdict, and the student's class rank via exam-results.ts's
// rankResults), so this keeps that glue in one place instead of duplicating
// it between the two page.tsx files — mirrors grading-scheme-loader.ts's role
// for the Marks Entry / Promotion pages. Deliberately scoped to a single
// exam's own exam_marks (not a saved multi-exam combination, issue #32's
// exam_combinations): the mockups print one named exam ("Mark Sheet — Annual
// Examination 2025") with no combination picker, and combination-based
// printables belong more naturally with the batch/result-book work split
// into issue #48.
import type { createClient } from '@/lib/supabase/server'
import { subjectsForClass } from '@/lib/students'
import { subjectFullMarks } from '@/lib/exam-setup'
import {
  evaluateSubject,
  evaluateOverallResult,
  type GradingScheme,
  type OverallResult,
  type SubjectMark,
  type SubjectResult,
} from '@/lib/grading'
import { rankResults, type RankBasis, type RankableResult } from '@/lib/exam-results'
import { loadGradingScheme } from '@/lib/grading-scheme-loader'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface ExamPrintStudent {
  id: string
  full_name: string
  roll_number: number | null
  guardian_name: string | null
}

export interface ExamPrintSubjectRow {
  subjectId: string
  subjectName: string
  result: SubjectResult
}

export interface ExamPrintContext {
  exam: { id: string; name: string; exam_year: number; class_id: string | null; grading_scheme_id: string | null }
  cls: { name: string; section: string | null } | null
  student: ExamPrintStudent
  scheme: GradingScheme | null
  subjectResults: ExamPrintSubjectRow[]
  overall: OverallResult | null
  rankPosition: number | null
  rankOutOf: number
}

/**
 * Loads everything a mark-sheet/progress-report page needs for one
 * (exam, student) pair. Returns null only when the exam or student itself
 * doesn't exist/isn't accessible (RLS-filtered) — a missing class, scheme, or
 * subject list instead leaves `scheme`/`overall` null and `subjectResults`
 * empty, letting the page render its own "not ready yet" messaging rather
 * than a 404, matching how marks-entry/promotion degrade.
 */
export async function loadExamPrintContext(
  supabase: SupabaseServerClient,
  examId: string,
  studentId: string,
): Promise<ExamPrintContext | null> {
  const [{ data: exam }, { data: student }] = await Promise.all([
    supabase
      .from('exams')
      .select('id, name, exam_year, class_id, grading_scheme_id')
      .eq('id', examId)
      .maybeSingle(),
    supabase.from('students').select('id, full_name, roll_number, guardian_name').eq('id', studentId).maybeSingle(),
  ])
  if (!exam || !student) return null

  let cls: { name: string; section: string | null } | null = null
  let subjectResults: ExamPrintSubjectRow[] = []
  let overall: OverallResult | null = null
  let rankPosition: number | null = null
  let rankOutOf = 0
  let scheme: GradingScheme | null = null

  if (exam.class_id) {
    const { data: clsRow } = await supabase
      .from('classes')
      .select('name, section')
      .eq('id', exam.class_id)
      .maybeSingle()
    cls = clsRow ?? null

    const [{ data: allSubjects }, { data: optionalRows }] = await Promise.all([
      supabase.from('subjects').select('id, name, class_id, theory_marks, mcq_marks, practical_marks').order('name'),
      supabase.from('student_subjects').select('student_id, subject_id, is_optional'),
    ])
    const subjects = subjectsForClass(allSubjects ?? [], exam.class_id)
    const optionalMap = new Map((optionalRows ?? []).map((o) => [`${o.student_id}:${o.subject_id}`, o.is_optional]))

    scheme = exam.grading_scheme_id ? await loadGradingScheme(supabase, exam.grading_scheme_id) : null

    if (scheme && subjects.length && cls) {
      let rosterQuery = supabase.from('students').select('id').eq('class_name', cls.name).is('archived_at', null)
      rosterQuery = cls.section ? rosterQuery.eq('section', cls.section) : rosterQuery.is('section', null)

      const [{ data: roster }, { data: marksRows }] = await Promise.all([
        rosterQuery,
        supabase.from('exam_marks').select('student_id, subject_id, obtained_marks').eq('exam_id', examId),
      ])
      const marksMap = new Map(
        (marksRows ?? []).map((m) => [`${m.student_id}:${m.subject_id}`, Number(m.obtained_marks)]),
      )

      const overallByStudent = new Map<string, OverallResult>()
      let studentSubjectResults: SubjectResult[] = []
      for (const s of roster ?? []) {
        const marks: SubjectMark[] = subjects.map((sub) => ({
          subjectId: sub.id,
          fullMarks: subjectFullMarks(sub),
          obtainedMarks: marksMap.get(`${s.id}:${sub.id}`) ?? 0,
          isOptional: optionalMap.get(`${s.id}:${sub.id}`) ?? false,
        }))
        const results = marks.map((m) => evaluateSubject(m, scheme as GradingScheme))
        overallByStudent.set(s.id, evaluateOverallResult(results, scheme as GradingScheme))
        if (s.id === studentId) studentSubjectResults = results
      }

      overall = overallByStudent.get(studentId) ?? null
      subjectResults = studentSubjectResults.map((r) => ({
        subjectId: r.subjectId,
        subjectName: subjects.find((sub) => sub.id === r.subjectId)?.name ?? r.subjectId,
        result: r,
      }))

      const basis: RankBasis = scheme.schemeType === 'grade_point' ? 'grade' : 'mark'
      const rankable: RankableResult[] = (roster ?? []).map((s) => {
        const o = overallByStudent.get(s.id)
        return { studentId: s.id, passed: o?.passed ?? false, gpa: o?.gpa ?? null, percent: o?.percent ?? 0 }
      })
      rankPosition = rankResults(rankable, basis).find((r) => r.studentId === studentId)?.position ?? null
      rankOutOf = roster?.length ?? 0
    }
  }

  return { exam, cls, student, scheme, subjectResults, overall, rankPosition, rankOutOf }
}
