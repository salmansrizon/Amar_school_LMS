import { describe, it, expect } from 'vitest'
import { matchesEmployeeQuery, filterEmployees, employeeShiftNames } from '@/lib/employees'

describe('matchesEmployeeQuery', () => {
  it('matches case-insensitively on name', () => {
    expect(matchesEmployeeQuery({ full_name: 'Sumaiya Akter' }, 'sumaiya')).toBe(true)
    expect(matchesEmployeeQuery({ full_name: 'Sumaiya Akter' }, 'ARIFUL')).toBe(false)
  })

  it('empty query matches everything', () => {
    expect(matchesEmployeeQuery({ full_name: 'Anyone' }, '')).toBe(true)
  })
})

describe('filterEmployees', () => {
  const rows = [
    { id: '1', full_name: 'Sumaiya Akter', category: 'Teacher', qualification: null, department: null, archived_at: null },
    { id: '2', full_name: 'Ariful Islam', category: 'Teacher', qualification: null, department: null, archived_at: null },
    { id: '3', full_name: 'Sharmin Sultana', category: 'Office Staff', qualification: null, department: null, archived_at: null },
  ]

  it('filters by query and category together', () => {
    expect(filterEmployees(rows, '', 'Teacher').map((r) => r.id)).toEqual(['1', '2'])
    expect(filterEmployees(rows, 'sharmin', '').map((r) => r.id)).toEqual(['3'])
    expect(filterEmployees(rows, '', '')).toHaveLength(3)
  })
})

describe('employeeShiftNames', () => {
  const shifts = [
    { id: 's1', name: 'Morning' },
    { id: 's2', name: 'Day' },
  ]
  const assignments = [
    { employee_id: 'e1', shift_id: 's1' },
    { employee_id: 'e1', shift_id: 's2' },
    { employee_id: 'e2', shift_id: 's1' },
  ]

  it('joins multiple assigned shift names', () => {
    expect(employeeShiftNames('e1', assignments, shifts)).toBe('Morning, Day')
  })

  it('returns a single name for one assignment', () => {
    expect(employeeShiftNames('e2', assignments, shifts)).toBe('Morning')
  })

  it('returns null when no shifts are assigned', () => {
    expect(employeeShiftNames('e3', assignments, shifts)).toBeNull()
  })
})
