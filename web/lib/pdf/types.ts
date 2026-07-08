/**
 * Shared printable data shapes. The composable template pieces
 * (institute header, exam header, student-info block, grade panel, footer) all
 * read from these, so every later printable — mark sheets, progress reports,
 * admit cards, receipts — reuses the same building blocks (issue #25).
 */

/** Institute identity, drawn at the top of every printable. */
export interface InstituteInfo {
  name: string
  address: string
  /** e.g. EIIN / Institute Code line; optional. */
  registration?: string
}

/** Exam context header, used by mark sheets / progress reports / admit cards. */
export interface ExamInfo {
  title: string
  className: string
  section?: string
  year: number
}

/** The student a printable is about. */
export interface StudentInfo {
  name: string
  roll: string
  className: string
  section?: string
  guardianName?: string
}

/** One subject row on a mark sheet. */
export interface SubjectResult {
  subject: string
  fullMarks: number
  obtainedMarks: number
  grade: string
  gradePoint?: number
}

/** Overall computed result shown in the grade panel. */
export interface GradeSummary {
  totalMarks: number
  obtainedMarks: number
  gpa?: number
  finalGrade: string
  passed: boolean
  position?: number
}

export interface MarkSheetData {
  institute: InstituteInfo
  exam: ExamInfo
  student: StudentInfo
  subjects: SubjectResult[]
  summary: GradeSummary
}
