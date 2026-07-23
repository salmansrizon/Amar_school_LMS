import { describe, it, expect } from 'vitest'
import { matchesEmployeeQuery, filterEmployees, employeeOfficeTimeNames } from '@/lib/employees'

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

describe('employeeOfficeTimeNames', () => {
  const officeTimes = [
    { id: 's1', name: 'Morning' },
    { id: 's2', name: 'Day' },
  ]
  const assignments = [
    { employee_id: 'e1', office_time_id: 's1' },
    { employee_id: 'e1', office_time_id: 's2' },
    { employee_id: 'e2', office_time_id: 's1' },
  ]

  it('joins multiple assigned officeTime names', () => {
    expect(employeeOfficeTimeNames('e1', assignments, officeTimes)).toBe('Morning, Day')
  })

  it('returns a single name for one assignment', () => {
    expect(employeeOfficeTimeNames('e2', assignments, officeTimes)).toBe('Morning')
  })

  it('returns null when no officeTimes are assigned', () => {
    expect(employeeOfficeTimeNames('e3', assignments, officeTimes)).toBeNull()
  })
})
