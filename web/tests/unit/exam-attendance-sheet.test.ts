import { describe, it, expect } from 'vitest'
import {
  studentsInRanges,
  sittingLabel,
  type SheetStudent,
} from '@/lib/exam-attendance-sheet'

// Seam: the exam attendance sheet (issue #97, map #91, docs/improvement.md §4)
// — one sheet is one room × one routine entry, the unit an invigilator is
// handed (grilling decision 10).

const students: SheetStudent[] = [
  { id: 's3', full_name: 'Chowdhury', roll_number: 12, class_name: 'Six', section: 'A' },
  { id: 's1', full_name: 'Akter', roll_number: 3, class_name: 'Six', section: 'A' },
  { id: 's2', full_name: 'Barua', roll_number: 7, class_name: 'Six', section: 'A' },
  { id: 's4', full_name: 'Das', roll_number: 40, class_name: 'Six', section: 'A' },
  { id: 's5', full_name: 'No Roll', roll_number: null, class_name: 'Six', section: 'A' },
]

describe('studentsInRanges', () => {
  it('returns only students whose roll falls in one of the room ranges', () => {
    const list = studentsInRanges(students, [{ roll_start: 1, roll_end: 10 }])
    expect(list.map((s) => s.roll_number)).toEqual([3, 7])
  })

  it('sorts by roll number regardless of input order — an invigilator reads down the list', () => {
    const list = studentsInRanges(students, [{ roll_start: 1, roll_end: 50 }])
    expect(list.map((s) => s.roll_number)).toEqual([3, 7, 12, 40])
  })

  it('spans several ranges when one exam holds a room more than once', () => {
    const list = studentsInRanges(students, [
      { roll_start: 1, roll_end: 5 },
      { roll_start: 39, roll_end: 41 },
    ])
    expect(list.map((s) => s.roll_number)).toEqual([3, 40])
  })

  it('never lists a student twice when ranges overlap', () => {
    const list = studentsInRanges(students, [
      { roll_start: 1, roll_end: 10 },
      { roll_start: 5, roll_end: 15 },
    ])
    expect(list.map((s) => s.id)).toEqual(['s1', 's2', 's3'])
  })

  it('leaves out a student with no roll — they were never seated', () => {
    const list = studentsInRanges(students, [{ roll_start: 1, roll_end: 100 }])
    expect(list.some((s) => s.roll_number === null)).toBe(false)
  })

  it('is empty when the room holds none of this exam', () => {
    expect(studentsInRanges(students, [])).toEqual([])
  })
})

describe('sittingLabel', () => {
  it('names the subject with its date and time window', () => {
    expect(
      sittingLabel({ subject: 'Bangla 1st Paper', exam_date: '2026-12-10', start_time: '10:00', end_time: '13:00' }),
    ).toBe('Bangla 1st Paper — 2026-12-10, 10:00–13:00')
  })

  it('drops the time window when the routine has no times', () => {
    expect(
      sittingLabel({ subject: 'Bangla 1st Paper', exam_date: '2026-12-10', start_time: null, end_time: null }),
    ).toBe('Bangla 1st Paper — 2026-12-10')
  })

  it('shows a one-sided window rather than an empty dash', () => {
    expect(
      sittingLabel({ subject: 'English', exam_date: '2026-12-11', start_time: '10:00', end_time: null }),
    ).toBe('English — 2026-12-11, 10:00')
  })
})
