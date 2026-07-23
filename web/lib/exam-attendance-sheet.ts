// Exam attendance sheet (issue #97, map #91, docs/improvement.md §4).
//
// One sheet = one room × one routine entry — one subject sitting in one room
// (map #91 grilling decision 10), because that is the unit an invigilator is
// physically handed. The students on it are exactly this exam's students
// seated in that room, which under mixed seating (#95) is a subset of the
// people in the room: another exam's candidates sit alongside them and belong
// on their own invigilator's sheet, not this one.

export interface SheetStudent {
  id: string
  full_name: string
  roll_number: number | null
  class_name: string
  section: string | null
}

export interface SeatRange {
  roll_start: number
  roll_end: number
}

/** This exam's students seated in one room, in roll order. A student with no
 *  roll was never placed by the seat plan, so they cannot appear. */
export function studentsInRanges(students: SheetStudent[], ranges: SeatRange[]): SheetStudent[] {
  if (!ranges.length) return []
  return students
    .filter(
      (s) =>
        s.roll_number !== null &&
        ranges.some((r) => s.roll_number! >= r.roll_start && s.roll_number! <= r.roll_end),
    )
    .sort((a, b) => a.roll_number! - b.roll_number!)
}

export interface Sitting {
  subject: string
  exam_date: string
  start_time: string | null
  end_time: string | null
}

/** "Bangla 1st Paper — 2026-12-10, 10:00–13:00". A routine with no times still
 *  names its date rather than trailing an empty window. */
export function sittingLabel(sitting: Sitting): string {
  const window =
    sitting.start_time && sitting.end_time
      ? `${sitting.start_time}–${sitting.end_time}`
      : (sitting.start_time ?? sitting.end_time ?? '')
  const when = window ? `${sitting.exam_date}, ${window}` : sitting.exam_date
  return `${sitting.subject} — ${when}`
}
