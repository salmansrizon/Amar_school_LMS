import { evaluateSubject, evaluateOverallResult, type GradingScheme, type SubjectMark, type SubjectResult, type OverallResult } from '@/lib/grading'

// The Student's own results (#449).
//
// This module does NOT grade. lib/grading.ts is the authority for that and is
// unit-tested; recomputing any of it here would create a second answer to the
// same question. All this does is turn the rows of student_exam_result into the
// SubjectMark shape that module already accepts, and group them by exam.

export interface ResultRow {
  exam_id: string
  exam_name: string
  exam_year: number
  results_published_at: string
  grading_scheme_id: string | null
  subject_id: string
  subject_name: string
  subject_theory_total: number
  subject_mcq_total: number
  subject_practical_total: number
  theory_obtained: number | null
  mcq_obtained: number | null
  practical_obtained: number | null
  obtained_marks: number | null
}

export interface PublishedExam {
  examId: string
  examName: string
  examYear: number
  gradingSchemeId: string | null
  rows: ResultRow[]
}

/** Full marks for a subject: the three components the school configured. A
 *  component the school set to zero simply does not count toward the total. */
export function subjectFullMarks(row: ResultRow): number {
  return row.subject_theory_total + row.subject_mcq_total + row.subject_practical_total
}

/** Total obtained. `exam_marks.obtained_marks` is a GENERATED column summing
 *  the three components, so it is authoritative wherever it is present; the
 *  fallback only covers a row whose components are all null. */
export function subjectObtained(row: ResultRow): number {
  if (row.obtained_marks !== null) return row.obtained_marks
  return (row.theory_obtained ?? 0) + (row.mcq_obtained ?? 0) + (row.practical_obtained ?? 0)
}

export function toSubjectMark(row: ResultRow): SubjectMark {
  return {
    subjectId: row.subject_id,
    fullMarks: subjectFullMarks(row),
    obtainedMarks: subjectObtained(row),
  }
}

/** One entry per published exam, newest year first. */
export function groupByExam(rows: ResultRow[]): PublishedExam[] {
  const byExam = new Map<string, PublishedExam>()
  for (const row of rows) {
    const existing = byExam.get(row.exam_id)
    if (existing) existing.rows.push(row)
    else
      byExam.set(row.exam_id, {
        examId: row.exam_id,
        examName: row.exam_name,
        examYear: row.exam_year,
        gradingSchemeId: row.grading_scheme_id,
        rows: [row],
      })
  }
  return [...byExam.values()].sort(
    (a, b) => b.examYear - a.examYear || a.examName.localeCompare(b.examName),
  )
}

export interface EvaluatedExam {
  subjects: (SubjectResult & { subjectName: string })[]
  overall: OverallResult
}

/** Grade one exam through lib/grading.ts, carrying the subject names along so
 *  the mark sheet can label its rows. */
export function evaluateExam(exam: PublishedExam, scheme: GradingScheme): EvaluatedExam {
  const names = new Map(exam.rows.map((r) => [r.subject_id, r.subject_name]))
  const subjects = exam.rows
    .map((row) => evaluateSubject(toSubjectMark(row), scheme))
    .map((result) => ({ ...result, subjectName: names.get(result.subjectId) ?? result.subjectId }))
  return { subjects, overall: evaluateOverallResult(subjects, scheme) }
}
