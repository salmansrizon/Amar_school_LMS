import { describe, it, expect } from 'vitest'
import { groupSchedule, nextPaper, type ExamRoutineRow, type SeatAssignment } from '@/lib/student/exam-schedule'

const paper = (over: Partial<ExamRoutineRow> & { exam_id: string; exam_date: string }): ExamRoutineRow => ({
  exam_name: over.exam_id,
  exam_year: 2026,
  day_of_week: 2,
  start_time: '10:00',
  end_time: '13:00',
  subject_name: 'Maths',
  room_name: '204',
  ...over,
})

const seat = (exam_id: string): SeatAssignment => ({
  exam_id,
  exam_name: exam_id,
  room_name: '204',
  roll_start: 1,
  roll_end: 40,
  roll_number: 7,
})

describe('groupSchedule', () => {
  it('groups papers under their exam, in date order', () => {
    const exams = groupSchedule(
      [
        paper({ exam_id: 'half', exam_date: '2026-09-10' }),
        paper({ exam_id: 'half', exam_date: '2026-09-08' }),
      ],
      [],
    )
    expect(exams).toHaveLength(1)
    expect(exams[0].papers.map((p) => p.exam_date)).toEqual(['2026-09-08', '2026-09-10'])
  })

  it('orders exams by their first paper', () => {
    const exams = groupSchedule(
      [
        paper({ exam_id: 'later', exam_date: '2026-11-01' }),
        paper({ exam_id: 'sooner', exam_date: '2026-09-01' }),
      ],
      [],
    )
    expect(exams.map((e) => e.examId)).toEqual(['sooner', 'later'])
  })

  it('attaches the seat when one is published, and null when it is not', () => {
    const exams = groupSchedule(
      [paper({ exam_id: 'a', exam_date: '2026-09-01' }), paper({ exam_id: 'b', exam_date: '2026-10-01' })],
      [seat('a')],
    )
    expect(exams.find((e) => e.examId === 'a')?.seat?.room_name).toBe('204')
    // An unpublished seat plan is simply absent from the view.
    expect(exams.find((e) => e.examId === 'b')?.seat).toBeNull()
  })
})

describe('nextPaper', () => {
  const rows = [
    paper({ exam_id: 'a', exam_date: '2026-09-01', start_time: '14:00' }),
    paper({ exam_id: 'a', exam_date: '2026-09-01', start_time: '09:00' }),
    paper({ exam_id: 'b', exam_date: '2026-08-01' }),
  ]

  it('picks the soonest paper still ahead, earliest start first', () => {
    expect(nextPaper(rows, '2026-08-26')?.start_time).toBe('09:00')
  })

  it('counts today itself as ahead — an exam this morning still matters', () => {
    expect(nextPaper(rows, '2026-09-01')?.exam_date).toBe('2026-09-01')
  })

  it('returns null once every paper is behind', () => {
    expect(nextPaper(rows, '2026-12-01')).toBeNull()
  })
})
