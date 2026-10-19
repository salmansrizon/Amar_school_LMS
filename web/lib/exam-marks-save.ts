// Marks entry save (#679, #700): turns the grid's typed rows into what is
// stored. Pure — the server action does the writing.
//
// Migration 0223 adds nullable components, exam_marks.is_absent and the
// save_exam_marks() function. Until it is applied the action falls back to the
// two-statement save, which can store neither an absent student nor a
// half-filled row (`needsMigration`).
import { toLatinDigits } from './bd-mobile'
import { markCellError, markRowState, type MarkCells, type SubjectMarksConfig } from './exam-setup'

export interface MarksEntryInput extends MarkCells {
  studentId: string
  /** Absent for this subject's paper. Counts as entered, with 0 marks. */
  absent?: boolean
}

/** One row as save_exam_marks() takes it. null = component not entered yet. */
export interface StoredMarkRow {
  student_id: string
  theory: number | null
  mcq: number | null
  practical: number | null
  is_absent: boolean
}

export interface MarksSave {
  rows: StoredMarkRow[]
  /** Students whose every cell is blank: their row is deleted. */
  cleared: string[]
  /** A cell holds something that is not a mark between 0 and the maximum. */
  invalid: boolean
  /** Some row is absent or half-filled — storable only after migration 0223. */
  needsMigration: boolean
}

export function buildMarksSave(inputs: MarksEntryInput[], subject: SubjectMarksConfig): MarksSave {
  const out: MarksSave = { rows: [], cleared: [], invalid: false, needsMigration: false }
  // A component the subject does not have (max 0) is stored 0; a blank one it
  // does have is stored null.
  const stored = (raw: string, max: number) => (max <= 0 ? 0 : raw.trim() ? Number(toLatinDigits(raw.trim())) : null)
  for (const r of inputs) {
    if (r.absent) {
      out.needsMigration = true
      out.rows.push({ student_id: r.studentId, theory: 0, mcq: 0, practical: 0, is_absent: true })
      continue
    }
    const state = markRowState(r, subject)
    if (state === 'empty') {
      out.cleared.push(r.studentId)
      continue
    }
    if (
      markCellError(r.theory, subject.theory_marks) ||
      markCellError(r.mcq, subject.mcq_marks) ||
      markCellError(r.practical, subject.practical_marks)
    ) {
      out.invalid = true
      continue
    }
    if (state === 'partial') out.needsMigration = true
    out.rows.push({
      student_id: r.studentId,
      theory: stored(r.theory, subject.theory_marks),
      mcq: stored(r.mcq, subject.mcq_marks),
      practical: stored(r.practical, subject.practical_marks),
      is_absent: false,
    })
  }
  return out
}

/** PostgREST "function not in the schema cache" (PGRST202) or Postgres
 * undefined_function (42883): migration 0223 is not applied. */
export function isMissingFunctionError(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883'
}
