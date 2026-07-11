// Exams II (issue #47, PRD §5.5): pure domain helpers for exam setup, the
// exam routine, and seat-plan capacity/overlap math — kept DB-free so the
// dense range logic gets its own unit-test pass, independent of the page/RPC
// wiring (mirrors the grading.ts / routine.ts split from #31 / #45).

export interface SubjectMarksConfig {
  theory_marks: number
  mcq_marks: number
  practical_marks: number
}

/** A subject's exam full marks — the sum of its configured components
 * (matches the "পূর্ণমান / Full Marks" column in exam-setup.html). */
export function subjectFullMarks(subject: SubjectMarksConfig): number {
  return subject.theory_marks + subject.mcq_marks + subject.practical_marks
}

/** Day-of-week (0=Sunday..6=Saturday, matches web/lib/routine.ts's dayLabel)
 * for a 'YYYY-MM-DD' exam_date, computed in UTC so it's independent of the
 * server/browser's local timezone (a plain DATE column carries no time). */
export function dateToDayOfWeek(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export interface RoutineEntryOrder {
  exam_date: string
  start_time: string
}

/** Chronological order for exam routine entries (date, then start time) —
 * shared by the routine builder table and its printable so they always list
 * sittings in the same order. */
export function sortRoutineEntries<T extends RoutineEntryOrder>(entries: T[]): T[] {
  return [...entries].sort(
    (a, b) => a.exam_date.localeCompare(b.exam_date) || a.start_time.localeCompare(b.start_time),
  )
}

export interface SeatRange {
  roll_start: number
  roll_end: number
}

/** True when two roll ranges share any roll number (inclusive both ends). */
export function rangesOverlap(a: SeatRange, b: SeatRange): boolean {
  return a.roll_start <= b.roll_end && a.roll_end >= b.roll_start
}

/** ids of every seat-plan row that overlaps at least one other row — drives
 * the mockup's per-row "Overlap" badge and the disabled Publish button
 * without a round trip to the server (the server still re-checks: see
 * publish_seat_plan). */
export function overlappingRowIds<T extends SeatRange & { id: string }>(rows: T[]): Set<string> {
  const bad = new Set<string>()
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (rangesOverlap(rows[i], rows[j])) {
        bad.add(rows[i].id)
        bad.add(rows[j].id)
      }
    }
  }
  return bad
}

/** True when a roll range's SIZE (not headcount) exceeds a room's capacity —
 * client-side mirror of the DB trigger (enforce_exam_seat_plan_school), for
 * immediate form feedback; the trigger stays the actual authority. */
export function exceedsCapacity(range: SeatRange, capacity: number): boolean {
  return range.roll_end - range.roll_start + 1 > capacity
}

/** Count of actual student roll numbers that fall inside [roll_start, roll_end]
 * — the mockup's "Student Count" column, distinct from the range's raw size
 * since roll numbers can have gaps (archived students, manual edits). */
export function countRollsInRange(rolls: number[], range: SeatRange): number {
  return rolls.filter((r) => r >= range.roll_start && r <= range.roll_end).length
}

// Exams List (exams-list.html) search/filter — client-side over an
// already-fetched page of exams, mirrors filterStudents in web/lib/students.ts.

export interface ExamListEntry {
  name: string
  status: string
  class_id: string | null
}

export function matchesExamQuery(exam: Pick<ExamListEntry, 'name'>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return exam.name.toLowerCase().includes(q)
}

export function filterExams<T extends ExamListEntry>(
  exams: T[],
  query: string,
  classId: string,
  status: string,
): T[] {
  return exams.filter(
    (e) => matchesExamQuery(e, query) && (!classId || e.class_id === classId) && (!status || e.status === status),
  )
}
