import { describe, expect, it } from 'vitest'
import { checkMobile, mobileInputProps, normalizeBdMobile, toLatinDigits } from '@/lib/bd-mobile'
import { matchesEmployeeDirectoryQuery, validateOptionalLogin } from '@/lib/employees'
import { friendlyStudentError, studentClassLabel } from '@/lib/students'
import { isIncompleteProfile, searchRoster, type RosterStudent } from '@/lib/school/roster'

describe('normalizeBdMobile', () => {
  it('accepts 01[3-9]######## and returns it unchanged', () => {
    expect(normalizeBdMobile('01711000001')).toBe('01711000001')
    expect(normalizeBdMobile('01312345678')).toBe('01312345678')
  })
  it('normalises Bangla digits, separators and +880/880 prefixes', () => {
    expect(normalizeBdMobile('০১৭১১০০০০০১')).toBe('01711000001')
    expect(normalizeBdMobile('+8801711000001')).toBe('01711000001')
    expect(normalizeBdMobile('8801711000001')).toBe('01711000001')
    expect(normalizeBdMobile('+880 1711-000001')).toBe('01711000001')
  })
  it('rejects garbage, wrong length and the 010/011/012 prefixes', () => {
    for (const bad of ['abc123', 'x', '12345', '0171100000', '017110000011', '01011000001', '01211000001', '+88017110000'])
      expect(normalizeBdMobile(bad), bad).toBeNull()
  })
})

describe('checkMobile', () => {
  it('blank is allowed', () => {
    expect(checkMobile(null)).toEqual({ value: null, invalid: false })
  })
  it('stores a valid changed value normalised', () => {
    expect(checkMobile('+8801711000001', '01811111111')).toEqual({ value: '01711000001', invalid: false })
  })
  it('flags a new invalid value', () => {
    expect(checkMobile('abc123', null).invalid).toBe(true)
    expect(checkMobile('12345', '01711000001').invalid).toBe(true)
  })
  it('lets an unchanged legacy invalid value through so the record stays editable', () => {
    expect(checkMobile('abc123', 'abc123')).toEqual({ value: 'abc123', invalid: false })
  })
})

describe('mobileInputProps', () => {
  it('always asks for the numeric keypad', () => {
    expect(mobileInputProps('', 'x').inputMode).toBe('tel')
  })
  it('drops the pattern for a legacy invalid value only', () => {
    expect(mobileInputProps('abc123', 'x')).not.toHaveProperty('pattern')
    expect(mobileInputProps('01711000001', 'x')).toHaveProperty('pattern')
    expect(mobileInputProps('', 'x')).toHaveProperty('pattern')
  })
})

describe('toLatinDigits', () => {
  it('converts only Bangla digits', () => {
    expect(toLatinDigits('রোল ১২৩ abc 45')).toBe('রোল 123 abc 45')
  })
})

describe('matchesEmployeeDirectoryQuery', () => {
  // Postgres returns unique_id as a number — this used to throw
  // "(e.unique_id ?? '').toLowerCase is not a function" and crash the page.
  const e = { full_name: 'Sumaiya Akter', mobile: '01711000001', unique_id: 1436 }
  it('does not throw for a numeric unique_id and matches it', () => {
    expect(matchesEmployeeDirectoryQuery(e, '1436')).toBe(true)
    expect(matchesEmployeeDirectoryQuery(e, '14')).toBe(true)
    expect(matchesEmployeeDirectoryQuery(e, '999')).toBe(false)
  })
  it('matches name case-insensitively, mobile, and tolerates nulls', () => {
    expect(matchesEmployeeDirectoryQuery(e, '  SUMAIYA ')).toBe(true)
    expect(matchesEmployeeDirectoryQuery(e, '0171100')).toBe(true)
    expect(matchesEmployeeDirectoryQuery({ full_name: 'A', mobile: null, unique_id: null }, 'seed')).toBe(false)
  })
  it('accepts Bangla digits in the query and in stored data', () => {
    expect(matchesEmployeeDirectoryQuery(e, '১৪৩৬')).toBe(true)
    expect(matchesEmployeeDirectoryQuery({ full_name: 'B', mobile: '০১৭১১০০০০০২' }, '01711000002')).toBe(true)
  })
  it('empty query matches everything', () => {
    expect(matchesEmployeeDirectoryQuery(e, '   ')).toBe(true)
  })
})

describe('searchRoster', () => {
  const s = (over: Partial<RosterStudent>): RosterStudent => ({
    id: 'i',
    full_name: 'Rahim',
    roll_number: 77,
    class_name: 'Six',
    section: 'A',
    guardian_name: null,
    class_offering_id: null,
    group_department: null,
    shift: null,
    academic_year: null,
    student_no: 'S9026',
    guardian_mobile: '01912345671',
    ...over,
  })
  it('finds Latin-digit data with a Bangla-digit query (roll, student no, mobile)', () => {
    expect(searchRoster([s({})], '৭৭')).toHaveLength(1)
    expect(searchRoster([s({})], '০১৯১২৩৪৫৬৭১')).toHaveLength(1)
    expect(searchRoster([s({})], 's৯০২৬')).toHaveLength(1)
  })
  it('survives a non-string student_no', () => {
    expect(searchRoster([s({ student_no: 9026 as unknown as string })], '902')).toHaveLength(1)
  })
})

describe('isIncompleteProfile', () => {
  it('is "no guardian mobile" — what the stat card counts', () => {
    expect(isIncompleteProfile({ guardian_mobile: null })).toBe(true)
    expect(isIncompleteProfile({ guardian_mobile: '' })).toBe(true)
    expect(isIncompleteProfile({ guardian_mobile: '01711000001' })).toBe(false)
  })
})

describe('friendlyStudentError', () => {
  const dup = (c: string) => ({ code: '23505', message: `duplicate key value violates unique constraint "${c}"` })
  it('maps both roll constraints to the localised message', () => {
    for (const c of ['students_roll_unique', 'student_enrollments_roll_unique']) {
      expect(friendlyStudentError(dup(c), 'en')).toMatch(/roll number is already used/)
      expect(friendlyStudentError(dup(c), 'bn')).toMatch(/রোল নম্বর/)
    }
  })
  it('passes any other error through', () => {
    expect(friendlyStudentError(dup('something_else'), 'en')).toBe(dup('something_else').message)
    expect(friendlyStudentError({ code: '42501', message: 'denied' }, 'en')).toBe('denied')
  })
})

describe('studentClassLabel', () => {
  it('uses the catalogue Class - Section shape', () => {
    expect(studentClassLabel('Six', 'A')).toBe('Six - A')
    expect(studentClassLabel('Six', null)).toBe('Six')
    expect(studentClassLabel(null, 'A')).toBeNull()
  })
})

describe('validateOptionalLogin messages', () => {
  it('answers in the requested language, English by default', () => {
    expect(validateOptionalLogin('a@b.co', 'short').error).toBe('Password must be at least 8 characters')
    expect(validateOptionalLogin('a@b.co', 'short', 'bn').error).toMatch(/পাসওয়ার্ড/)
    expect(validateOptionalLogin('a@b.co', '', 'bn').error).toMatch(/ইমেইল/)
  })
  it('rejects a malformed email', () => {
    expect(validateOptionalLogin('not-an-email', 'longenough').error).toBe('Enter a valid email address')
    expect(validateOptionalLogin('not-an-email', 'longenough', 'bn').error).toMatch(/ইমেইল/)
  })
})
