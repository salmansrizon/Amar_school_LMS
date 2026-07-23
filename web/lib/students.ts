// Students I/II helpers (issues #27, #46): list filtering, profile display,
// subject assignment and behaviour SMS bits, kept pure for unit testing.

export interface StudentListRow {
  id: string
  full_name: string
  roll_number: number | null
  class_name: string | null
  section: string | null
  guardian_name: string | null
  archived_at: string | null
}

/** "Class 8 / A" — drops missing parts, null when nothing is set. Shift left
 *  the student side with issue #100; class + section carry the grouping. */
export function classSectionLabel(
  className: string | null | undefined,
  section: string | null | undefined,
): string | null {
  const parts = [className, section].filter(Boolean)
  return parts.length ? parts.join(' / ') : null
}

/** Case-insensitive match on name, roll number or guardian name (list search). */
export function matchesStudentQuery(s: StudentListRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    s.full_name.toLowerCase().includes(q) ||
    (s.roll_number !== null && String(s.roll_number) === q) ||
    (s.guardian_name ?? '').toLowerCase().includes(q)
  )
}

export function filterStudents(
  students: StudentListRow[],
  query: string,
  className: string,
  section: string,
): StudentListRow[] {
  return students.filter(
    (s) =>
      matchesStudentQuery(s, query) &&
      (!className || s.class_name === className) &&
      (!section || s.section === section),
  )
}

/** Per-student average rating from a flat (student_id, rating) list, 1 decimal. */
export function behaviourAverages(
  entries: { student_id: string; rating: number | null }[],
): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>()
  for (const e of entries) {
    if (e.rating === null) continue
    const acc = sums.get(e.student_id) ?? { total: 0, count: 0 }
    acc.total += e.rating
    acc.count += 1
    sums.set(e.student_id, acc)
  }
  const out = new Map<string, number>()
  for (const [id, { total, count }] of sums) out.set(id, Math.round((total / count) * 10) / 10)
  return out
}

/** Sections that exist for the selected class (all sections when unset). */
export function sectionsForClass(
  classes: { name: string; section: string | null }[],
  className: string,
): string[] {
  const pool = className ? classes.filter((c) => c.name === className) : classes
  return [...new Set(pool.map((c) => c.section).filter(Boolean))] as string[]
}

const PHOTO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** Storage extension for an allowed photo MIME type; null = not allowed. */
export function photoExtension(mimeType: string): string | null {
  return PHOTO_EXT[mimeType] ?? null
}

// Subject assignment (issue #46, PRD §5.1) helpers.

export interface SubjectOption {
  id: string
  name: string
  class_id: string | null
}

/** A class's assignable catalogue: subjects linked to it, plus school-wide ones.
 * Generic so callers carrying extra columns (e.g. exam-setup.html's mark
 * config, issue #47) keep them through the filter instead of narrowing to
 * SubjectOption's bare shape. */
export function subjectsForClass<T extends SubjectOption>(subjects: T[], classId: string): T[] {
  return subjects.filter((s) => s.class_id === null || s.class_id === classId)
}

const MAX_NOTE_CHARS = 80

/** SMS body for a behaviour-record send — kept short (single segment budget). */
export function behaviourSmsBody(studentName: string, note: string, rating: number): string {
  const trimmed = note.length > MAX_NOTE_CHARS ? `${note.slice(0, MAX_NOTE_CHARS)}…` : note
  return `Behaviour note for ${studentName} (rating ${rating}/10): ${trimmed}`
}
