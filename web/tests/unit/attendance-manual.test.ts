import { describe, it, expect } from 'vitest'
import {
  studentClassOptions,
  studentSectionOptions,
  filterRoster,
  mergeLeaves,
  filterLeaves,
  monthGrid,
} from '@/lib/attendance-manual'

const students = [
  { id: '1', full_name: 'Rakib Hasan', class_name: 'Class 8', section: 'A', roll_number: 2, shift_id: 'morning' },
  { id: '2', full_name: 'Tamim Iqbal', class_name: 'Class 8', section: 'B', roll_number: 1, shift_id: 'day' },
  { id: '3', full_name: 'Sadia Islam', class_name: 'Class 9', section: 'A', roll_number: null, shift_id: null },
  { id: '4', full_name: 'Nusrat Jahan', class_name: null, section: null, roll_number: null, shift_id: null },
]

describe('studentClassOptions / studentSectionOptions', () => {
  it('returns distinct sorted classes, skipping nulls', () => {
    expect(studentClassOptions(students)).toEqual(['Class 8', 'Class 9'])
  })

  it('returns sections scoped to a class', () => {
    expect(studentSectionOptions(students, 'Class 8')).toEqual(['A', 'B'])
    expect(studentSectionOptions(students, 'Class 9')).toEqual(['A'])
  })
})

describe('filterRoster', () => {
  it('filters by class and section, sorted by roll number', () => {
    // Class 8 has Tamim (roll 1) and Rakib (roll 2) -> roll order, not name order
    expect(filterRoster(students, 'Class 8', '').map((s) => s.id)).toEqual(['2', '1'])
    expect(filterRoster(students, 'Class 8', 'B').map((s) => s.id)).toEqual(['2'])
  })

  it('filters by shift', () => {
    expect(filterRoster(students, 'Class 8', '', 'morning').map((s) => s.id)).toEqual(['1'])
  })

  it('empty filters return everything sorted', () => {
    expect(filterRoster(students, '', '')).toHaveLength(4)
  })

  it('rolls without a number sort after rolled students, then by name', () => {
    const rows = filterRoster(students, '', '')
    expect(rows.map((r) => r.id)).toEqual(['2', '1', '4', '3'])
  })
})

describe('mergeLeaves / filterLeaves', () => {
  const studentLeaves = [
    {
      id: 'sl1',
      student_id: '1',
      from_day: '2026-07-05',
      to_day: '2026-07-06',
      reason: 'Fever',
      status: 'pending',
      created_at: '2026-07-04T10:00:00Z',
    },
  ]
  const employeeLeaves = [
    {
      id: 'el1',
      employee_id: 'e1',
      from_day: '2026-07-05',
      to_day: '2026-07-07',
      reason: 'Family event',
      status: 'approved',
      created_at: '2026-07-04T12:00:00Z',
    },
  ]
  const studentNames = new Map([['1', 'Rakib Hasan']])
  const employeeNames = new Map([['e1', 'Kamrul Hasan']])

  it('merges both kinds, newest first', () => {
    const rows = mergeLeaves(studentLeaves, employeeLeaves, studentNames, employeeNames)
    expect(rows.map((r) => r.id)).toEqual(['el1', 'sl1'])
    expect(rows[0]).toMatchObject({ kind: 'employee', name: 'Kamrul Hasan', status: 'approved' })
  })

  it('filters by search text and kind', () => {
    const rows = mergeLeaves(studentLeaves, employeeLeaves, studentNames, employeeNames)
    expect(filterLeaves(rows, 'rakib', '').map((r) => r.id)).toEqual(['sl1'])
    expect(filterLeaves(rows, '', 'employee').map((r) => r.id)).toEqual(['el1'])
    expect(filterLeaves(rows, '', '')).toHaveLength(2)
  })
})

describe('monthGrid', () => {
  it('leads with blank cells to align the first weekday', () => {
    // 2026-07-01 is a Wednesday -> 3 leading blanks (Sun, Mon, Tue)
    const grid = monthGrid(2026, 6, [])
    expect(grid.slice(0, 3)).toEqual([
      { day: null, iso: null, isOff: false, isSignificant: false, label: null },
      { day: null, iso: null, isOff: false, isSignificant: false, label: null },
      { day: null, iso: null, isOff: false, isSignificant: false, label: null },
    ])
    expect(grid[3]).toMatchObject({ day: 1, iso: '2026-07-01' })
  })

  it('shades every Saturday as off even without an off_days row', () => {
    const grid = monthGrid(2026, 6, [])
    const saturday = grid.find((c) => c.iso === '2026-07-04')
    expect(saturday?.isOff).toBe(true)
    expect(saturday?.isSignificant).toBe(false)
  })

  it('marks an explicit significant off-day from the table', () => {
    const grid = monthGrid(2026, 6, [{ day: '2026-07-05', label: 'Special day', is_significant: true }])
    const cell = grid.find((c) => c.iso === '2026-07-05')
    expect(cell).toMatchObject({ isOff: true, isSignificant: true, label: 'Special day' })
  })

  it('has the correct day count for the month', () => {
    const grid = monthGrid(2026, 1, []) // Feb 2026 (not a leap year) = 28 days
    const realDays = grid.filter((c) => c.day !== null)
    expect(realDays).toHaveLength(28)
  })
})
