import type { GradingScheme } from '@/lib/grading'
import { missingSubjects, subjectFullMarks, subjectObtained, type PublishedExam } from '@/lib/student/results'
import { rawTotal } from '@/lib/student/dashboard'

// Result detail while the grading scheme cannot be read (#702): marks, total and
// (when complete) rank only. No grade, GPA or pass/fail, because those need
// grading_schemes/grade_bands, which a student login cannot read.

/** 'graded' = the scheme loaded and the page behaves as it always did. */
export const resultMode = (scheme: GradingScheme | null): 'graded' | 'raw' => (scheme ? 'graded' : 'raw')

export interface RawResult {
  subjects: { id: string; name: string; obtained: number; full: number }[]
  /** Class subjects this exam holds no mark for. */
  missing: { id: string; name: string }[]
  total: { obtained: number; full: number }
  /** A missing subject hides the rank, same rule as the graded page. */
  showRank: boolean
}

export function rawResult(exam: PublishedExam, classSubjects: { id: string; name: string }[]): RawResult {
  const missing = missingSubjects(exam, classSubjects)
  return {
    subjects: exam.rows.map((r) => ({
      id: r.subject_id,
      name: r.subject_name,
      obtained: subjectObtained(r),
      full: subjectFullMarks(r),
    })),
    missing,
    total: rawTotal(exam.rows),
    showRank: missing.length === 0,
  }
}
