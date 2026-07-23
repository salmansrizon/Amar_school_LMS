import { describe, it, expect } from 'vitest'
import {
  resolveClassSectionRecipients,
  resolveGroupRecipients,
  parseManualNumbers,
  resolveRecipients,
  type ComposeStudentRow,
  type ComposeEmployeeRow,
} from '@/lib/sms/recipients'

// Recipient-list resolution (issue #36, PRD §5.7): class/shift/section,
// teacher/staff/management group, or manual numbers. Pure so the same logic
// drives both the "estimated recipients" live count and the actual send.

const students: ComposeStudentRow[] = [
  { id: 's1', full_name: 'Rahim', class_name: 'Class 6', section: 'A', guardian_phone: '01711111111' },
  { id: 's2', full_name: 'Karim', class_name: 'Class 6', section: 'B', guardian_phone: '01722222222' },
  { id: 's3', full_name: 'Salma', class_name: 'Class 7', section: 'A', guardian_phone: '01733333333' },
  { id: 's4', full_name: 'No Phone', class_name: 'Class 6', section: 'A', guardian_phone: null },
]

const employees: ComposeEmployeeRow[] = [
  { id: 'e1', full_name: 'Teacher One', category: 'Teacher', mobile: '01811111111' },
  { id: 'e2', full_name: 'Teacher Two', category: 'Teacher', mobile: null },
  { id: 'e3', full_name: 'Guard One', category: 'Staff', mobile: '01822222222' },
]

describe('resolveClassSectionRecipients', () => {
  it('filters by class, shift, and section together', () => {
    const result = resolveClassSectionRecipients(students, {
      className: 'Class 6',
      section: 'A',
    })
    expect(result).toEqual([{ phone: '01711111111', name: 'Rahim', studentId: 's1' }])
  })

  it('a blank field means "any" (matches "All Sections"/"All Shifts")', () => {
    const result = resolveClassSectionRecipients(students, { className: 'Class 6' })
    expect(result.map((r) => r.studentId)).toEqual(['s1', 's2'])
  })

  it('skips students with no guardian phone on file rather than erroring', () => {
    const result = resolveClassSectionRecipients(students, { className: 'Class 6', section: 'A' })
    expect(result.map((r) => r.studentId)).toEqual(['s1'])
  })

  it('no filters at all returns every student with a phone', () => {
    expect(resolveClassSectionRecipients(students, {})).toHaveLength(3)
  })
})

describe('resolveGroupRecipients', () => {
  it('returns only employees in the chosen category with a mobile number', () => {
    expect(resolveGroupRecipients(employees, 'Teacher')).toEqual([
      { phone: '01811111111', name: 'Teacher One', employeeId: 'e1' },
    ])
  })

  it('an unknown/blank category returns nothing', () => {
    expect(resolveGroupRecipients(employees, '')).toEqual([])
    expect(resolveGroupRecipients(employees, 'Management')).toEqual([])
  })
})

describe('parseManualNumbers', () => {
  it('splits on commas and trims whitespace', () => {
    expect(parseManualNumbers('01711111111, 01911111111 ,  01811111111')).toEqual([
      { phone: '01711111111', name: '01711111111' },
      { phone: '01911111111', name: '01911111111' },
      { phone: '01811111111', name: '01811111111' },
    ])
  })

  it('drops blank entries and duplicates', () => {
    expect(parseManualNumbers('01711111111,, 01711111111,')).toEqual([
      { phone: '01711111111', name: '01711111111' },
    ])
  })

  it('an empty string yields no recipients', () => {
    expect(parseManualNumbers('')).toEqual([])
  })
})

describe('resolveRecipients (mode dispatch)', () => {
  const base = { students, employees, filter: {}, category: '', manualNumbers: '' }

  it('dispatches to class/shift/section', () => {
    const result = resolveRecipients('class_section', { ...base, filter: { className: 'Class 7' } })
    expect(result).toEqual([{ phone: '01733333333', name: 'Salma', studentId: 's3' }])
  })

  it('dispatches to group', () => {
    const result = resolveRecipients('group', { ...base, category: 'Staff' })
    expect(result).toEqual([{ phone: '01822222222', name: 'Guard One', employeeId: 'e3' }])
  })

  it('dispatches to manual numbers', () => {
    const result = resolveRecipients('manual', { ...base, manualNumbers: '01700000000' })
    expect(result).toEqual([{ phone: '01700000000', name: '01700000000' }])
  })
})
