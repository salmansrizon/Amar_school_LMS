import { describe, it, expect } from 'vitest'
import {
  matchesEmployeeQuery,
  filterEmployees,
  employeeOfficeTimeNames,
  friendlyEmployeeError,
  validateOptionalLogin,
  validateEmployeeCategory,
  EMPLOYEE_CATEGORIES,
} from '@/lib/employees'

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

describe('friendlyEmployeeError', () => {
  it('replaces a duplicate rfid_card_number violation with a legible message', () => {
    const error = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "employees_rfid_card_number_key"',
    }
    expect(friendlyEmployeeError(error)).toBe('That RFID card number is already used by someone else at this school')
  })

  it('passes through any other error unchanged', () => {
    const notFound = { code: '23503', message: 'foreign key violation' }
    expect(friendlyEmployeeError(notFound)).toBe('foreign key violation')

    // A 23505 on a different constraint (e.g. a future unique column) must
    // not be swallowed into the rfid_card_number message.
    const otherUnique = { code: '23505', message: 'duplicate key value violates unique constraint "employees_pkey"' }
    expect(friendlyEmployeeError(otherUnique)).toBe(otherUnique.message)
  })
})

describe('validateOptionalLogin', () => {
  it('allows both blank — no login wanted', () => {
    expect(validateOptionalLogin('', '')).toEqual({})
  })

  it('allows both present and a valid-length password', () => {
    expect(validateOptionalLogin('teacher@school.test', 'longenough')).toEqual({})
  })

  it('rejects an email with no password', () => {
    expect(validateOptionalLogin('teacher@school.test', '').error).toMatch(/both an email and a password/)
  })

  it('rejects a password with no email', () => {
    expect(validateOptionalLogin('', 'longenough').error).toMatch(/both an email and a password/)
  })

  it('rejects a password shorter than 8 characters', () => {
    expect(validateOptionalLogin('teacher@school.test', 'short').error).toBe('Password must be at least 8 characters')
  })
})

describe('validateEmployeeCategory', () => {
  it('allows blank — category stays optional', () => {
    expect(validateEmployeeCategory(null)).toEqual({})
    expect(validateEmployeeCategory('')).toEqual({})
  })

  it('allows each of the twenty fixed values (issue #567 expansion)', () => {
    for (const category of EMPLOYEE_CATEGORIES) {
      expect(validateEmployeeCategory(category)).toEqual({})
    }
    expect(EMPLOYEE_CATEGORIES).toHaveLength(20)
  })

  it('rejects anything outside the fixed list', () => {
    expect(validateEmployeeCategory('Guard').error).toBe(
      `Category must be one of: ${EMPLOYEE_CATEGORIES.join(', ')}`,
    )
  })

  it('allows a legacy value that matches the employee’s own pre-existing category', () => {
    // "admin" is a real category value on this staging DB, from before the
    // field was locked down — genuinely outside the fixed list, unlike
    // "Head Teacher" which the #567 expansion folded into the list proper.
    expect(validateEmployeeCategory('admin', 'admin')).toEqual({})
  })

  it('still rejects a legacy value changed to something else non-standard', () => {
    expect(validateEmployeeCategory('Guard', 'admin').error).toBe(
      `Category must be one of: ${EMPLOYEE_CATEGORIES.join(', ')}`,
    )
  })
})
