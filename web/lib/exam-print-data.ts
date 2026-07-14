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
//
// Exams V (issue #48) added loadExamRosterResults: result-book, result-
// inquiry and batch-print all need every student's result at once, not just
// one — this now does that roster-wide computation once, and
// loadExamPrintContext (still the one-student per-page shape) is a thin
// wrapper over it instead of duplicating the same marks-fetch-and-evaluate
// loop a third time.
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

export interface ExamRosterResultRow {
  studentId: string
  fullName: string
  rollNumber: number | null
  guardianName: string | null
  subjectResults: ExamPrintSubjectRow[]
  totalFull: number
  totalObtained: number
  overall: OverallResult | null
  rankPosition: number | null
  rankOutOf: number
}

export interface ExamRosterResult {
  exam: { id: string; name: string; exam_year: number; class_id: string | null; grading_scheme_id: string | null }
  cls: { name: string; section: string | null } | null
  scheme: GradingScheme | null
  subjects: { id: string; name: string }[]
  rows: ExamRosterResultRow[]
}

/**
 * Loads every roster student's result for one exam at once — the shared
 * shape behind Result Book / Result Inquiry / batch-print-all (issue #48).
 * Returns null only when the exam itself doesn't exist/isn't accessible
 * (RLS-filtered); a missing class/scheme/subject list instead leaves
 * `scheme` null and `rows` empty, letting callers render their own
 * "not ready yet" messaging rather than a 404 (matches marks-entry/promotion).
 */
export async function loadExamRosterResults(
  supabase: SupabaseServerClient,
  examId: string,
  basis: RankBasis = 'grade',
): Promise<ExamRosterResult | null> {
  const { data: exam } = await supabase
    .from('exams')
    .select('id, name, exam_year, class_id, grading_scheme_id')
    .eq('id', examId)
    .maybeSingle()
  if (!exam) return null

  let cls: { name: string; section: string | null } | null = null
  let scheme: GradingScheme | null = null
  let rows: ExamRosterResultRow[] = []
  let subjectOptions: { id: string; name: string }[] = []

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
    subjectOptions = subjects.map((s) => ({ id: s.id, name: s.name }))
    const optionalMap = new Map((optionalRows ?? []).map((o) => [`${o.student_id}:${o.subject_id}`, o.is_optional]))

    scheme = exam.grading_scheme_id ? await loadGradingScheme(supabase, exam.grading_scheme_id) : null

    if (scheme && subjects.length && cls) {
      let rosterQuery = supabase
        .from('students')
        .select('id, full_name, roll_number, guardian_name')
        .eq('class_name', cls.name)
        .is('archived_at', null)
        .order('roll_number', { ascending: true, nullsFirst: false })
      rosterQuery = cls.section ? rosterQuery.eq('section', cls.section) : rosterQuery.is('section', null)

      const [{ data: roster }, { data: marksRows }] = await Promise.all([
        rosterQuery,
        supabase.from('exam_marks').select('student_id, subject_id, obtained_marks').eq('exam_id', examId),
      ])
      const marksMap = new Map(
        (marksRows ?? []).map((m) => [`${m.student_id}:${m.subject_id}`, Number(m.obtained_marks)]),
      )

      const overallByStudent = new Map<string, OverallResult>()
      const subjectResultsByStudent = new Map<string, SubjectResult[]>()
      for (const s of roster ?? []) {
        const marks: SubjectMark[] = subjects.map((sub) => ({
          subjectId: sub.id,
          fullMarks: subjectFullMarks(sub),
          obtainedMarks: marksMap.get(`${s.id}:${sub.id}`) ?? 0,
          isOptional: optionalMap.get(`${s.id}:${sub.id}`) ?? false,
        }))
        const results = marks.map((m) => evaluateSubject(m, scheme as GradingScheme))
        overallByStudent.set(s.id, evaluateOverallResult(results, scheme as GradingScheme))
        subjectResultsByStudent.set(s.id, results)
      }

      const rankable: RankableResult[] = (roster ?? []).map((s) => {
        const o = overallByStudent.get(s.id)
        return { studentId: s.id, passed: o?.passed ?? false, gpa: o?.gpa ?? null, percent: o?.percent ?? 0 }
      })
      const rankedById = new Map(rankResults(rankable, basis).map((r) => [r.studentId, r]))
      const rankOutOf = roster?.length ?? 0

      rows = (roster ?? []).map((s) => {
        const subjectResults = subjectResultsByStudent.get(s.id) ?? []
        return {
          studentId: s.id,
          fullName: s.full_name,
          rollNumber: s.roll_number,
          guardianName: s.guardian_name,
          subjectResults: subjectResults.map((r) => ({
            subjectId: r.subjectId,
            subjectName: subjects.find((sub) => sub.id === r.subjectId)?.name ?? r.subjectId,
            result: r,
          })),
          totalFull: subjectResults.reduce((sum, r) => sum + r.fullMarks, 0),
          totalObtained: subjectResults.reduce((sum, r) => sum + r.obtainedMarks, 0),
          overall: overallByStudent.get(s.id) ?? null,
          rankPosition: rankedById.get(s.id)?.position ?? null,
          rankOutOf,
        }
      })
    }
  }

  return { exam, cls, scheme, subjects: subjectOptions, rows }
}

/**
 * Loads everything a mark-sheet/progress-report page needs for one
 * (exam, student) pair. Returns null when the exam or student itself doesn't
 * exist/isn't accessible (RLS-filtered), or when the student isn't part of
 * the exam's roster (e.g. transferred out since) — the same "not ready yet"
 * degrade as loadExamRosterResults, just narrowed to one row.
 */
export async function loadExamPrintContext(
  supabase: SupabaseServerClient,
  examId: string,
  studentId: string,
): Promise<ExamPrintContext | null> {
  const [{ data: exam }, { data: student }, roster] = await Promise.all([
    supabase
      .from('exams')
      .select('id, name, exam_year, class_id, grading_scheme_id')
      .eq('id', examId)
      .maybeSingle(),
    supabase.from('students').select('id, full_name, roll_number, guardian_name').eq('id', studentId).maybeSingle(),
    loadExamRosterResults(supabase, examId),
  ])
  if (!exam || !student || !roster) return null

  const row = roster.rows.find((r) => r.studentId === studentId)

  return {
    exam,
    cls: roster.cls,
    student,
    scheme: roster.scheme,
    subjectResults: row?.subjectResults ?? [],
    overall: row?.overall ?? null,
    rankPosition: row?.rankPosition ?? null,
    rankOutOf: row?.rankOutOf ?? 0,
  }
}
