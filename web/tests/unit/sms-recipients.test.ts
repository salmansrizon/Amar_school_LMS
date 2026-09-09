import { describe, it, expect } from 'vitest'
import {
  classTargetFromInput,
  formatClassTargetLabel,
  resolveClassTargetRecipients,
  resolveGroupRecipients,
  parseManualNumbers,
  resolveRecipients,
  type ComposeStudentRow,
  type ComposeEmployeeRow,
} from '@/lib/sms/recipients'
import type { OfferingRow, PublicationTarget } from '@/lib/publishing'
import { PUBLICATION_TARGET_SCENARIOS } from '@/lib/publishing-targeting-scenarios'

// Recipient-list resolution (issue #36, PRD §5.7; Offering-aware since map #598
// Wave 5, #606). Pure so the same logic drives both the "estimated recipients"
// live count and the actual send. Class targeting resolves through each
// Student's CURRENT Enrollment's Class Offering via the shared predicate
// (targetMatchesOffering, lib/publishing.ts), never students.class_name/section.

/** A ComposeStudentRow whose current Enrollment points at `offering` (or none). */
function student(
  id: string,
  full_name: string,
  guardian_phone: string | null,
  offering: OfferingRow | null,
): ComposeStudentRow {
  return {
    id,
    full_name,
    guardian_phone,
    student_enrollments: offering ? [{ class_offerings: [offering] }] : [],
  }
}

const nineMorningA: OfferingRow = {
  id: 'off-nine-morning-a',
  name: 'Nine',
  academic_year: 2026,
  shift: 'Morning',
  group_department: 'Science',
  section: 'A',
}
const nineDayB: OfferingRow = {
  id: 'off-nine-day-b',
  name: 'Nine',
  academic_year: 2026,
  shift: 'Day',
  group_department: 'Commerce',
  section: 'B',
}

const students: ComposeStudentRow[] = [
  student('s1', 'Rahim', '01711111111', nineMorningA),
  student('s2', 'Karim', '01722222222', nineDayB),
  student('s3', 'Salma', '01733333333', null), // unplaced — no current Enrollment
  student('s4', 'No Phone', null, nineMorningA),
]

const employees: ComposeEmployeeRow[] = [
  { id: 'e1', full_name: 'Teacher One', category: 'Teacher', mobile: '01811111111' },
  { id: 'e2', full_name: 'Teacher Two', category: 'Teacher', mobile: null },
  { id: 'e3', full_name: 'Guard One', category: 'Staff', mobile: '01822222222' },
]

const allTarget: PublicationTarget = classTargetFromInput(
  { scope: 'all', offeringId: '', className: '', shift: '', groupDepartment: '', section: '' },
  2026,
)

describe('classTargetFromInput', () => {
  it('all → every predicate field null', () => {
    expect(allTarget).toEqual({
      scope: 'all',
      classOfferingId: null,
      className: null,
      academicYear: null,
      shift: null,
      groupDepartment: null,
      section: null,
    })
  })

  it('offering → only the id, from offeringId', () => {
    const target = classTargetFromInput(
      { scope: 'offering', offeringId: 'off-x', className: '', shift: '', groupDepartment: '', section: '' },
      2026,
    )
    expect(target).toMatchObject({ scope: 'offering', classOfferingId: 'off-x', className: null, academicYear: null })
  })

  it('broadcast → className + the passed-in pinned Year, empty dimensions become Any (null)', () => {
    const target = classTargetFromInput(
      { scope: 'broadcast', offeringId: '', className: 'Nine', shift: '', groupDepartment: '', section: 'A' },
      2027,
    )
    expect(target).toEqual({
      scope: 'broadcast',
      classOfferingId: null,
      className: 'Nine',
      academicYear: 2027,
      shift: null,
      groupDepartment: null,
      section: 'A',
    })
  })
})

describe('resolveClassTargetRecipients', () => {
  it('all scope reaches every Student with a phone, enrolled or not', () => {
    expect(resolveClassTargetRecipients(students, allTarget).map((r) => r.studentId)).toEqual(['s1', 's2', 's3'])
  })

  it('exact-Offering scope reaches only the Student in that Offering', () => {
    const target = classTargetFromInput(
      { scope: 'offering', offeringId: nineMorningA.id, className: '', shift: '', groupDepartment: '', section: '' },
      2026,
    )
    expect(resolveClassTargetRecipients(students, target).map((r) => r.studentId)).toEqual(['s1'])
  })

  it('broadcast, all dimensions Any: every Student sharing the Class name in the pinned Year', () => {
    const target = classTargetFromInput(
      { scope: 'broadcast', offeringId: '', className: 'Nine', shift: '', groupDepartment: '', section: '' },
      2026,
    )
    expect(resolveClassTargetRecipients(students, target).map((r) => r.studentId)).toEqual(['s1', 's2'])
  })

  it('broadcast narrowed to one Shift excludes the other Shift', () => {
    const target = classTargetFromInput(
      { scope: 'broadcast', offeringId: '', className: 'Nine', shift: 'Morning', groupDepartment: '', section: '' },
      2026,
    )
    expect(resolveClassTargetRecipients(students, target).map((r) => r.studentId)).toEqual(['s1'])
  })

  it('a non-all target never reaches an unplaced Student', () => {
    const target = classTargetFromInput(
      { scope: 'broadcast', offeringId: '', className: 'Nine', shift: '', groupDepartment: '', section: '' },
      2026,
    )
    expect(resolveClassTargetRecipients(students, target).map((r) => r.studentId)).not.toContain('s3')
  })

  it('skips Students with no guardian phone rather than erroring', () => {
    const target = classTargetFromInput(
      { scope: 'offering', offeringId: nineMorningA.id, className: '', shift: '', groupDepartment: '', section: '' },
      2026,
    )
    // s4 is also in nineMorningA but has no phone.
    expect(resolveClassTargetRecipients(students, target).map((r) => r.studentId)).toEqual(['s1'])
  })
})

// The shared parity scenario table (map #598 Wave 1, #602) is the single
// source of truth for "does this target reach this Offering". SMS resolution
// must agree with it on every row, exactly as homeworkTargetsOffering does
// (tests/unit/classes-count.test.ts) — a Student enrolled in the scenario's
// candidate Offering is a recipient iff the scenario expects a match.
describe('resolveClassTargetRecipients — shared targeting parity (#606)', () => {
  for (const scenario of PUBLICATION_TARGET_SCENARIOS) {
    it(scenario.description, () => {
      const offering: OfferingRow = {
        id: scenario.offering.id,
        name: scenario.offering.name,
        academic_year: scenario.offering.academicYear,
        shift: scenario.offering.shift,
        group_department: scenario.offering.groupDepartment,
        section: scenario.offering.section,
      }
      const only = [student('p1', 'Parity', '01700000000', offering)]
      const reached = resolveClassTargetRecipients(only, scenario.target).length === 1
      expect(reached).toBe(scenario.expected)
    })
  }
})

describe('formatClassTargetLabel', () => {
  it('all → null (Send Log shows a dash)', () => {
    expect(formatClassTargetLabel(allTarget, null)).toBeNull()
  })

  it('offering → the Class Catalogue label of the picked Offering', () => {
    const target = classTargetFromInput(
      { scope: 'offering', offeringId: nineMorningA.id, className: '', shift: '', groupDepartment: '', section: '' },
      2026,
    )
    expect(formatClassTargetLabel(target, { name: 'Nine', section: 'A', group_department: 'Science', shift: 'Morning' })).toBe(
      'Nine (Science) - Morning - A',
    )
  })

  it('broadcast → Class name plus each non-Any dimension, " / "-joined', () => {
    const target = classTargetFromInput(
      { scope: 'broadcast', offeringId: '', className: 'Nine', shift: 'Morning', groupDepartment: '', section: 'A' },
      2026,
    )
    expect(formatClassTargetLabel(target, null)).toBe('Nine / Morning / A')
  })

  it('broadcast with every dimension Any → just the Class name', () => {
    const target = classTargetFromInput(
      { scope: 'broadcast', offeringId: '', className: 'Nine', shift: '', groupDepartment: '', section: '' },
      2026,
    )
    expect(formatClassTargetLabel(target, null)).toBe('Nine')
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
  const base = { students, employees, target: allTarget, category: '', manualNumbers: '' }

  it('dispatches to class targeting', () => {
    const target = classTargetFromInput(
      { scope: 'offering', offeringId: nineDayB.id, className: '', shift: '', groupDepartment: '', section: '' },
      2026,
    )
    const result = resolveRecipients('class_section', { ...base, target })
    expect(result).toEqual([{ phone: '01722222222', name: 'Karim', studentId: 's2' }])
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
