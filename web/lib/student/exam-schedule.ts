// The Student's exam calendar (#450), kept pure.

export interface ExamRoutineRow {
  exam_id: string
  exam_name: string
  exam_year: number
  exam_date: string
  day_of_week: number
  start_time: string | null
  end_time: string | null
  subject_name: string | null
  room_name: string | null
}

export interface SeatAssignment {
  exam_id: string
  exam_name: string
  room_name: string | null
  roll_start: number
  roll_end: number
  roll_number: number | null
}

export interface ScheduledExam {
  examId: string
  examName: string
  examYear: number
  papers: ExamRoutineRow[]
  seat: SeatAssignment | null
}

/** Group papers by exam, each exam's papers in date order, exams by their own
 *  first paper — a student reads a calendar forwards. */
export function groupSchedule(
  rows: ExamRoutineRow[],
  seats: SeatAssignment[],
): ScheduledExam[] {
  const seatByExam = new Map(seats.map((s) => [s.exam_id, s]))
  const byExam = new Map<string, ScheduledExam>()

  for (const row of rows) {
    const existing = byExam.get(row.exam_id)
    if (existing) existing.papers.push(row)
    else
      byExam.set(row.exam_id, {
        examId: row.exam_id,
        examName: row.exam_name,
        examYear: row.exam_year,
        papers: [row],
        seat: seatByExam.get(row.exam_id) ?? null,
      })
  }

  for (const exam of byExam.values()) {
    exam.papers.sort(
      (a, b) => a.exam_date.localeCompare(b.exam_date) || (a.start_time ?? '').localeCompare(b.start_time ?? ''),
    )
  }

  return [...byExam.values()].sort((a, b) =>
    (a.papers[0]?.exam_date ?? '').localeCompare(b.papers[0]?.exam_date ?? ''),
  )
}

/**
 * The next paper on or after `today`, for the home screen.
 *
 * An exam is the most important thing on a student's calendar, so it belongs
 * alongside Today/Tomorrow rather than behind its own tab — that is the whole
 * point of surfacing it here.
 */
export function nextPaper(rows: ExamRoutineRow[], today: string): ExamRoutineRow | null {
  return (
    [...rows]
      .filter((r) => r.exam_date >= today)
      .sort(
        (a, b) =>
          a.exam_date.localeCompare(b.exam_date) ||
          (a.start_time ?? '').localeCompare(b.start_time ?? ''),
      )[0] ?? null
  )
}
