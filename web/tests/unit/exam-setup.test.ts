import { describe, it, expect } from 'vitest'
import {
  subjectFullMarks,
  dateToDayOfWeek,
  rangesOverlap,
  overlappingRowIds,
  exceedsCapacity,
  countRollsInRange,
  filterExams,
  filterResultRoster,
  roomForRoll,
  sortRoutineEntries,
} from '@/lib/exam-setup'

describe('subjectFullMarks', () => {
  it('sums theory + mcq + practical', () => {
    expect(subjectFullMarks({ theory_marks: 70, mcq_marks: 0, practical_marks: 0 })).toBe(70)
    expect(subjectFullMarks({ theory_marks: 50, mcq_marks: 25, practical_marks: 25 })).toBe(100)
    expect(subjectFullMarks({ theory_marks: 25, mcq_marks: 0, practical_marks: 25 })).toBe(50)
  })
})

describe('dateToDayOfWeek', () => {
  it('matches known weekdays (UTC, timezone-independent)', () => {
    // 2025-12-10 is a Wednesday.
    expect(dateToDayOfWeek('2025-12-10')).toBe(3)
    // 2025-12-14 is a Sunday.
    expect(dateToDayOfWeek('2025-12-14')).toBe(0)
    // 2025-12-13 is a Saturday.
    expect(dateToDayOfWeek('2025-12-13')).toBe(6)
  })
})

describe('sortRoutineEntries', () => {
  it('orders by date, then by start time within a date', () => {
    const entries = [
      { exam_date: '2025-12-14', start_time: '10:00' },
      { exam_date: '2025-12-10', start_time: '11:00' },
      { exam_date: '2025-12-10', start_time: '09:00' },
    ]
    expect(sortRoutineEntries(entries)).toEqual([
      { exam_date: '2025-12-10', start_time: '09:00' },
      { exam_date: '2025-12-10', start_time: '11:00' },
      { exam_date: '2025-12-14', start_time: '10:00' },
    ])
  })

  it('does not mutate the input array', () => {
    const entries = [
      { exam_date: '2025-12-14', start_time: '10:00' },
      { exam_date: '2025-12-10', start_time: '11:00' },
    ]
    const original = [...entries]
    sortRoutineEntries(entries)
    expect(entries).toEqual(original)
  })
})

describe('rangesOverlap', () => {
  it('detects an overlap on shared roll numbers (inclusive edges)', () => {
    expect(rangesOverlap({ roll_start: 1, roll_end: 30 }, { roll_start: 25, roll_end: 55 })).toBe(true)
    expect(rangesOverlap({ roll_start: 1, roll_end: 30 }, { roll_start: 30, roll_end: 40 })).toBe(true)
  })

  it('is false for disjoint ranges', () => {
    expect(rangesOverlap({ roll_start: 1, roll_end: 30 }, { roll_start: 31, roll_end: 55 })).toBe(false)
  })
})

describe('overlappingRowIds', () => {
  it('flags both rows of an overlapping pair, leaves clean rows alone', () => {
    const rows = [
      { id: 'r101', roll_start: 1, roll_end: 30 },
      { id: 'r102', roll_start: 25, roll_end: 55 },
      { id: 'r201', roll_start: 56, roll_end: 90 },
    ]
    const bad = overlappingRowIds(rows)
    expect(bad.has('r101')).toBe(true)
    expect(bad.has('r102')).toBe(true)
    expect(bad.has('r201')).toBe(false)
  })

  it('returns an empty set when nothing overlaps', () => {
    const rows = [
      { id: 'a', roll_start: 1, roll_end: 10 },
      { id: 'b', roll_start: 11, roll_end: 20 },
    ]
    expect(overlappingRowIds(rows).size).toBe(0)
  })
})

describe('exceedsCapacity', () => {
  it('is true when the range size exceeds room capacity', () => {
    expect(exceedsCapacity({ roll_start: 1, roll_end: 41 }, 40)).toBe(true)
  })

  it('is false when the range size is within capacity (inclusive)', () => {
    expect(exceedsCapacity({ roll_start: 1, roll_end: 40 }, 40)).toBe(false)
    expect(exceedsCapacity({ roll_start: 1, roll_end: 30 }, 40)).toBe(false)
  })
})

describe('countRollsInRange', () => {
  it('counts only the rolls that fall inside the range, gaps included', () => {
    const rolls = [1, 2, 3, 5, 8, 30]
    expect(countRollsInRange(rolls, { roll_start: 1, roll_end: 30 })).toBe(6)
    expect(countRollsInRange(rolls, { roll_start: 4, roll_end: 8 })).toBe(2)
    expect(countRollsInRange(rolls, { roll_start: 31, roll_end: 40 })).toBe(0)
  })
})

describe('filterExams', () => {
  const exams = [
    { name: 'Annual Examination 2025', status: 'open', class_id: 'c8a' },
    { name: 'Half-Yearly Examination 2025', status: 'open', class_id: 'c6a' },
    { name: 'First Term Examination 2025', status: 'closed', class_id: 'c9a' },
  ]

  it('matches by case-insensitive name substring', () => {
    expect(filterExams(exams, 'annual', '', '')).toHaveLength(1)
    expect(filterExams(exams, 'ANNUAL', '', '')).toHaveLength(1)
    expect(filterExams(exams, 'examination', '', '')).toHaveLength(3)
    expect(filterExams(exams, 'nonexistent', '', '')).toHaveLength(0)
  })

  it('filters by class', () => {
    expect(filterExams(exams, '', 'c6a', '')).toHaveLength(1)
  })

  it('filters by status', () => {
    expect(filterExams(exams, '', '', 'closed')).toHaveLength(1)
    expect(filterExams(exams, '', '', 'open')).toHaveLength(2)
  })

  it('combines all three filters', () => {
    expect(filterExams(exams, 'first', 'c9a', 'closed')).toHaveLength(1)
    expect(filterExams(exams, 'first', 'c9a', 'open')).toHaveLength(0)
  })

  it('empty filters return everything', () => {
    expect(filterExams(exams, '', '', '')).toHaveLength(3)
  })
})

describe('filterResultRoster', () => {
  const rows = [
    { rollNumber: 1, passed: true },
    { rollNumber: 2, passed: true },
    { rollNumber: 5, passed: false },
    { rollNumber: 8, passed: true },
    { rollNumber: null, passed: true },
  ]

  it('with no filters returns everything', () => {
    expect(filterResultRoster(rows, { rollFrom: null, rollTo: null, promotedOnly: false })).toHaveLength(5)
  })

  it('roll range is inclusive both ends and excludes null rolls', () => {
    const filtered = filterResultRoster(rows, { rollFrom: 2, rollTo: 5, promotedOnly: false })
    expect(filtered.map((r) => r.rollNumber)).toEqual([2, 5])
  })

  it('rollFrom alone is an open-ended lower bound', () => {
    const filtered = filterResultRoster(rows, { rollFrom: 5, rollTo: null, promotedOnly: false })
    expect(filtered.map((r) => r.rollNumber)).toEqual([5, 8])
  })

  it('promotedOnly drops failed students', () => {
    const filtered = filterResultRoster(rows, { rollFrom: null, rollTo: null, promotedOnly: true })
    expect(filtered.every((r) => r.passed)).toBe(true)
    expect(filtered).toHaveLength(4)
  })

  it('combines roll range and promotedOnly', () => {
    const filtered = filterResultRoster(rows, { rollFrom: 1, rollTo: 5, promotedOnly: true })
    expect(filtered.map((r) => r.rollNumber)).toEqual([1, 2])
  })
})

describe('roomForRoll', () => {
  const seatRows = [
    { roll_start: 1, roll_end: 30, roomName: 'Room 101' },
    { roll_start: 31, roll_end: 60, roomName: 'Room 102' },
  ]

  it('finds the room whose range contains the roll (inclusive edges)', () => {
    expect(roomForRoll(seatRows, 1)).toBe('Room 101')
    expect(roomForRoll(seatRows, 30)).toBe('Room 101')
    expect(roomForRoll(seatRows, 31)).toBe('Room 102')
  })

  it('is null for a roll outside every range, or a null roll', () => {
    expect(roomForRoll(seatRows, 61)).toBeNull()
    expect(roomForRoll(seatRows, null)).toBeNull()
  })
})
