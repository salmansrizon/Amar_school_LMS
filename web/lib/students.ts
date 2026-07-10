// Subject assignment (issue #46, PRD §5.1) helpers.

export interface SubjectOption {
  id: string
  name: string
  class_id: string | null
}

/** A class's assignable catalogue: subjects linked to it, plus school-wide ones. */
export function subjectsForClass(subjects: SubjectOption[], classId: string): SubjectOption[] {
  return subjects.filter((s) => s.class_id === null || s.class_id === classId)
}

const MAX_NOTE_CHARS = 80

/** SMS body for a behaviour-record send — kept short (single segment budget). */
export function behaviourSmsBody(studentName: string, note: string, rating: number): string {
  const trimmed = note.length > MAX_NOTE_CHARS ? `${note.slice(0, MAX_NOTE_CHARS)}…` : note
  return `Behaviour note for ${studentName} (rating ${rating}/10): ${trimmed}`
}
