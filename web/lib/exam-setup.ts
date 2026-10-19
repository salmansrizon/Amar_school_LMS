// Exams II (issue #47, PRD §5.5): pure domain helpers for exam setup, the
// exam routine, and seat-plan capacity/overlap math — kept DB-free so the
// dense range logic gets its own unit-test pass, independent of the page/RPC
// wiring (mirrors the grading.ts / routine.ts split from #31 / #45).

import type { MessageKey } from './i18n'
import { toLatinDigits } from './bd-mobile'

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

/** One exam sitting, as the routine stores it. Times are 'HH:MM' or
 * 'HH:MM:SS' (a Postgres `time` reads back with seconds). */
export interface RoutineSlot {
  /** Set when sittings of several exams of one class are compared (#699): the
   * candidate's own sitting is then the one with the same exam AND subject —
   * exams of one class share their subject ids. */
  exam_id?: string
  subject_id: string
  exam_date: string
  start_time: string
  end_time: string
}

/** The first existing sitting that clashes with `candidate`: same day, times
 * overlapping. One exam belongs to one class, so two sittings of the same exam
 * overlapping means the same students are expected in two places at once.
 * Back-to-back sittings (one ends as the next starts) do not clash, and the
 * candidate's own subject is skipped — saving a subject again replaces its
 * sitting rather than adding a second one. */
export function overlappingRoutineEntry<T extends RoutineSlot>(entries: T[], candidate: RoutineSlot): T | null {
  const hm = (v: string) => v.slice(0, 5)
  return (
    entries.find(
      (e) =>
        !(e.subject_id === candidate.subject_id && e.exam_id === candidate.exam_id) &&
        e.exam_date === candidate.exam_date &&
        hm(candidate.start_time) < hm(e.end_time) &&
        hm(candidate.end_time) > hm(e.start_time),
    ) ?? null
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

/** Seats a room already owes, summed across every exam seated in it — mixed
 *  seating (issue #95) makes capacity a room-wide budget, not a per-row check.
 *  Mirrors what enforce_exam_seat_plan_school computes server-side. */
export function roomUsedSeats<T extends SeatRange & { room_id: string }>(
  rows: T[],
  roomId: string,
): number {
  return rows
    .filter((r) => r.room_id === roomId)
    .reduce((n, r) => n + (r.roll_end - r.roll_start + 1), 0)
}

/** Rooms whose total allocation across all exams is past capacity — the
 *  room-wide successor to the per-row exceedsCapacity check. */
export function overCapacityRoomIds<T extends SeatRange & { room_id: string }>(
  rows: T[],
  rooms: { id: string; capacity: number }[],
): Set<string> {
  const bad = new Set<string>()
  for (const room of rooms) {
    if (roomUsedSeats(rows, room.id) > room.capacity) bad.add(room.id)
  }
  return bad
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

// Exam Basic Info (map #366, CONTEXT.md) — the minimum configuration an exam
// needs before it can be worked with. Not a stored flag or workflow state:
// simply whether the two columns are set. Both the exams list and the setup
// page gate their actions on this, so the rule lives here rather than being
// re-derived in each component.

/** The two Basic Info fields every gate reads. */
export interface ExamConfiguration {
  class_id: string | null
  grading_scheme_id: string | null
}

/** Marks entry and the exam documents need a class *and* a grading scheme. */
export function examBasicInfoComplete(exam: ExamConfiguration): boolean {
  return Boolean(exam.class_id) && Boolean(exam.grading_scheme_id)
}

/** Co-curricular entry needs only the class — the grading scheme plays no part
 * in it, matching what its own page has always required. */
export function examHasClass(exam: Pick<ExamConfiguration, 'class_id'>): boolean {
  return Boolean(exam.class_id)
}

/** Map 013 sweep: colour state for one of an exam row's six actions, derived
 * purely from data the row already carries — never a stored workflow flag.
 * Basic Info is the row's one real bottleneck, so it is the only action with
 * a genuine "done" signal (`requires: 'none'`): `done` once both class and
 * grading scheme are set, `next` (the thing to do now) while they are not.
 * The other five actions have no stored per-action completion, so they are
 * simply `locked` while their own gate (`class` or `basicInfo`) is unmet and
 * `default` once available — inventing a `done` for them would be a fabricated
 * signal, not a derived one. */
export type RowActionState = 'next' | 'done' | 'locked' | 'default'

export function examActionState(exam: ExamConfiguration, requires: 'none' | 'class' | 'basicInfo'): RowActionState {
  if (requires === 'none') return examBasicInfoComplete(exam) ? 'done' : 'next'
  const gated = requires === 'class' ? !examHasClass(exam) : !examBasicInfoComplete(exam)
  return gated ? 'locked' : 'default'
}

// Exams V (issue #48): roll-range + promoted-only filtering, shared by
// Result Book and batch print-all. "Promoted" has no stored column anywhere
// in the schema — it's operationalized the same way Promotion's own
// checkbox default is (promotion-controls.tsx): a student's OverallResult
// `passed` flag. Kept pure/DB-free and inclusive-both-ends, mirroring
// exam_seat_plans' roll_start/roll_end range concept.

export interface ResultRosterFilterRow {
  rollNumber: number | null
  passed: boolean
}

export interface ResultRosterFilterOptions {
  rollFrom: number | null
  rollTo: number | null
  promotedOnly: boolean
}

export function filterResultRoster<T extends ResultRosterFilterRow>(
  rows: T[],
  { rollFrom, rollTo, promotedOnly }: ResultRosterFilterOptions,
): T[] {
  return rows.filter((r) => {
    if (rollFrom !== null && (r.rollNumber === null || r.rollNumber < rollFrom)) return false
    if (rollTo !== null && (r.rollNumber === null || r.rollNumber > rollTo)) return false
    if (promotedOnly && !r.passed) return false
    return true
  })
}

// Map 013 A3 (exam landing → lifecycle board): one stage per exam, derived
// purely from data the row already carries (status, Basic Info, a start
// date) plus two cheap per-exam facts the page computes once. Never a stored
// workflow column — same philosophy as examActionState, and this reuses
// examBasicInfoComplete rather than re-deriving the setup gate.
//
// There is no exams.end_date column (only start_date), so "still running" vs
// "overdue for marks" needs a window end. `lastExamDate` supplies it from the
// exam's own routine (exam_routine_entries.exam_date) when one has been
// entered; a single-day exam with no routine yet falls back to its own
// start_date as its whole window, which is the only date this can know.
export type ExamStage = 'setup' | 'upcoming' | 'running' | 'marksPending' | 'ready' | 'closed'

export interface ExamStageInput extends ExamConfiguration {
  status: string
  start_date: string | null
}

export interface ExamStageFacts {
  /** True once exam_marks rows entered === enrolled roster × applicable
   *  subjects for this exam — false too when that target is unknown/zero
   *  (no roster or no subjects yet), since "complete" cannot be claimed
   *  without a real target. */
  marksComplete: boolean
  /** Latest `exam_routine_entries.exam_date` for the exam ('YYYY-MM-DD'), or
   *  null when no routine entry exists yet. */
  lastExamDate: string | null
}

/** Order of precedence, each a real fact and never inferred beyond it:
 *  Closed is terminal and overrides everything else. Setup (Basic Info
 *  incomplete) is the one true bottleneck and wins over dates — an exam
 *  can't be "running" without a class/grading scheme, whatever its dates
 *  say. Marks-complete means ready to publish/close regardless of the
 *  calendar (a school can finish entry early). Otherwise it's upcoming
 *  (no start date yet, or one in the future), overdue (`marksPending`, the
 *  window has closed and marks aren't in), or running (today falls inside
 *  the window). */
export function examStage(exam: ExamStageInput, today: string, facts: ExamStageFacts): ExamStage {
  if (exam.status === 'closed') return 'closed'
  if (!examBasicInfoComplete(exam)) return 'setup'
  if (facts.marksComplete) return 'ready'
  if (!exam.start_date || exam.start_date > today) return 'upcoming'
  const windowEnd = facts.lastExamDate ?? exam.start_date
  return today > windowEnd ? 'marksPending' : 'running'
}

/** The one status chip an exam shows, on the list and on its setup page alike:
 * a result that is out beats every workflow stage, otherwise the stage says
 * where the exam stands. */
export type ExamChip = ExamStage | 'published'

export function examChip(stage: ExamStage, resultsPublishedAt: string | null): ExamChip {
  return resultsPublishedAt ? 'published' : stage
}

export const EXAM_CHIP: Record<ExamChip, { label: MessageKey; tone: 'mint' | 'brand' | 'sun' | 'alert' | 'sky' | 'muted' }> = {
  published: { label: 'exams.pubPublished', tone: 'mint' },
  ready: { label: 'exams.pubReady', tone: 'brand' },
  running: { label: 'exams.pubMarking', tone: 'sun' },
  marksPending: { label: 'exams.stageMarksPending', tone: 'alert' },
  upcoming: { label: 'exams.stageUpcoming', tone: 'sky' },
  setup: { label: 'exams.pubDraft', tone: 'muted' },
  closed: { label: 'exams.stageClosed', tone: 'muted' },
}

// Marks entry (audit AC3): "not entered" is the absence of an exam_marks row,
// never a stored 0 — the three component columns are NOT NULL, so a row is
// either entered in full or does not exist. These two helpers are the whole
// rule; the entry grid and the save action both read them.

export type MarkCellError = 'invalid' | 'negative' | 'overMax'

/** What is wrong with one typed mark, or null when it is blank or valid. A
 * blank cell is not an error — it means "not entered". */
export function markCellError(raw: string, max: number): MarkCellError | null {
  const v = raw.trim()
  if (!v) return null
  // Bangla digits are fine: ৭৫ is 75.
  const n = Number(toLatinDigits(v))
  if (!Number.isFinite(n)) return 'invalid'
  if (n < 0) return 'negative'
  if (n > max) return 'overMax'
  return null
}

export interface MarkCells {
  theory: string
  mcq: string
  practical: string
}

/** `empty`: nothing typed in any component the subject actually has — the
 * student's mark is not entered and no row is stored. `complete`: every such
 * component has a value. `partial`: some but not all — it cannot be saved,
 * because the blank component would have to be stored as a 0 nobody typed. */
export function markRowState(cells: MarkCells, subject: SubjectMarksConfig): 'empty' | 'partial' | 'complete' {
  const applicable = [
    subject.theory_marks > 0 ? cells.theory : null,
    subject.mcq_marks > 0 ? cells.mcq : null,
    subject.practical_marks > 0 ? cells.practical : null,
  ].filter((c): c is string => c !== null)
  const filled = applicable.filter((c) => c.trim() !== '').length
  if (filled === 0) return 'empty'
  return filled === applicable.length ? 'complete' : 'partial'
}

// Publishing results (audit AC2/AC6): what must be true before an exam's
// results go out to students, and what is merely worth a warning.

export interface PublishFacts {
  classSet: boolean
  /** null when no grading scheme is picked. */
  schemeType: string | null
  bandCount: number
  students: number
  subjects: number
  /** Students with a mark entered in every subject. */
  studentsComplete: number
  /** Subjects with a mark entered for every student. */
  subjectsComplete: number
}

export type PublishBlock = 'noClass' | 'noScheme' | 'noBands'

/** A scheme that grades by band needs at least one band; a numeric scheme
 * reports raw marks only and never reads its bands (grading.ts). */
export function schemeHasUsableBands(schemeType: string | null, bandCount: number): boolean {
  return schemeType === 'numeric' || bandCount > 0
}

/** Why results cannot be published at all, or null. Incomplete marks are
 * deliberately not a block — a school may publish with a student absent — the
 * confirm dialog warns about them instead (see publishMarksComplete). */
export function publishBlock(facts: PublishFacts): PublishBlock | null {
  if (!facts.classSet) return 'noClass'
  if (!facts.schemeType) return 'noScheme'
  if (!schemeHasUsableBands(facts.schemeType, facts.bandCount)) return 'noBands'
  return null
}

/** True only against a real target: an exam with no roster or no subjects has
 * nothing entered, so it is never "complete". */
export function publishMarksComplete(facts: PublishFacts): boolean {
  return facts.students > 0 && facts.subjects > 0 && facts.studentsComplete === facts.students
}

/** Tallies the entered marks of one exam against its roster and subjects.
 * `markKeys` holds `${studentId}:${subjectId}` for every exam_marks row; rows
 * for a student or subject no longer on the exam are simply never looked up,
 * so they cannot inflate the count. */
export function tallyMarks(studentIds: string[], subjectIds: string[], markKeys: Set<string>) {
  const has = (st: string, sub: string) => markKeys.has(`${st}:${sub}`)
  return {
    entered: studentIds.reduce((n, st) => n + subjectIds.filter((sub) => has(st, sub)).length, 0),
    total: studentIds.length * subjectIds.length,
    studentsComplete: subjectIds.length ? studentIds.filter((st) => subjectIds.every((sub) => has(st, sub))).length : 0,
    subjectsComplete: studentIds.length ? subjectIds.filter((sub) => studentIds.every((st) => has(st, sub))).length : 0,
  }
}

// Exams V (issue #48): resolves an admit card's "Exam Center" field — the
// exam_seat_plans row (issue #47) whose [roll_start, roll_end] contains the
// student's roll, joined to its room name. Not a stored column on students;
// derived the same way seat-plan's own countRollsInRange treats a range as a
// set of contained roll numbers.
export interface SeatPlanRoomRow extends SeatRange {
  roomName: string
}

export function roomForRoll(seatRows: SeatPlanRoomRow[], roll: number | null): string | null {
  if (roll === null) return null
  return seatRows.find((r) => roll >= r.roll_start && roll <= r.roll_end)?.roomName ?? null
}
