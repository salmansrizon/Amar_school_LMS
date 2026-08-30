import { describe, it, expect } from 'vitest'
import {
  PASSWORD_MASK,
  studentLoginSmsBody,
  classSectionLabel,
  matchesStudentQuery,
  behaviourAverages,
  photoExtension,
  sectionsForClass,
  classNamesFor,
  subjectsForClass,
  nextRollNumber,
  parseRollNumber,
  rollScopeChanged,
  friendlyStudentError,
  behaviourSmsBody,
  type StudentListRow,
  type SubjectOption,
  type RollRow,
} from '@/lib/students'

const row = (over: Partial<StudentListRow> = {}): StudentListRow => ({
  id: 'x',
  full_name: 'Rakib Hasan',
  roll_number: 1,
  class_name: 'Class 8',
  section: 'A',
  guardian_name: 'Abdul Hasan',
  archived_at: null,
  ...over,
})

describe('classSectionLabel', () => {
  it('joins the present parts with slashes', () => {
    expect(classSectionLabel('Class 8', 'A')).toBe('Class 8 / A')
    expect(classSectionLabel('Class 8', null)).toBe('Class 8')
  })

  it('returns null when nothing is set', () => {
    expect(classSectionLabel(null, null)).toBeNull()
  })
})

describe('matchesStudentQuery', () => {
  it('matches name case-insensitively', () => {
    expect(matchesStudentQuery(row(), 'rakib')).toBe(true)
    expect(matchesStudentQuery(row(), 'tamim')).toBe(false)
  })

  it('matches an exact roll number', () => {
    expect(matchesStudentQuery(row({ roll_number: 12 }), '12')).toBe(true)
    expect(matchesStudentQuery(row({ roll_number: 12 }), '1')).toBe(false) // no prefix match on roll
    expect(matchesStudentQuery(row({ roll_number: null }), '12')).toBe(false)
  })

  it('matches guardian name', () => {
    expect(matchesStudentQuery(row(), 'abdul')).toBe(true)
    expect(matchesStudentQuery(row({ guardian_name: null }), 'abdul')).toBe(false)
  })

  it('empty query matches everything', () => {
    expect(matchesStudentQuery(row(), '  ')).toBe(true)
  })
})

// filterStudents' cases moved with it to tests/unit/school-roster.test.ts.

describe('behaviourAverages', () => {
  it('averages per student to one decimal, skipping null ratings', () => {
    const avgs = behaviourAverages([
      { student_id: 'a', rating: 5 },
      { student_id: 'a', rating: 4 },
      { student_id: 'a', rating: null },
      { student_id: 'b', rating: 2 },
    ])
    expect(avgs.get('a')).toBe(4.5)
    expect(avgs.get('b')).toBe(2)
    expect(avgs.get('c')).toBeUndefined()
  })

  it('rounds to one decimal', () => {
    const avgs = behaviourAverages([
      { student_id: 'a', rating: 5 },
      { student_id: 'a', rating: 4 },
      { student_id: 'a', rating: 4 },
    ])
    expect(avgs.get('a')).toBe(4.3)
  })
})

describe('sectionsForClass', () => {
  const classes = [
    { name: 'Class 8', section: 'A' },
    { name: 'Class 8', section: 'B' },
    { name: 'Class 9', section: 'A' },
    { name: 'Class 9', section: null },
  ]

  it('lists only the selected class’s sections, deduped', () => {
    expect(sectionsForClass(classes, 'Class 8')).toEqual(['A', 'B'])
    expect(sectionsForClass(classes, 'Class 9')).toEqual(['A'])
  })

  it('lists all sections when no class is chosen', () => {
    expect(sectionsForClass(classes, '')).toEqual(['A', 'B'])
  })
})

describe('classNamesFor', () => {
  it('lists distinct class names, first-occurrence order preserved', () => {
    const classes = [
      { name: 'Class 8', section: 'A' },
      { name: 'Class 8', section: 'B' },
      { name: 'Class 9', section: 'A' },
    ]
    expect(classNamesFor(classes)).toEqual(['Class 8', 'Class 9'])
  })

  it('returns nothing for an empty catalogue', () => {
    expect(classNamesFor([])).toEqual([])
  })
})

describe('nextRollNumber', () => {
  const rolls: RollRow[] = [
    { class_name: 'Class 8', section: 'A', roll_number: 5 },
    { class_name: 'Class 8', section: 'A', roll_number: 3 },
    { class_name: 'Class 8', section: 'B', roll_number: 1 },
    { class_name: 'Class 9', section: 'A', roll_number: 9 },
  ]

  it('is the highest roll in the class+section plus the increment', () => {
    expect(nextRollNumber(rolls, 'Class 8', 'A', 1)).toBe(6)
  })

  it('does not let a different section leak into the count', () => {
    // Section A is up to roll 5; Section B has only roll 1 and should not
    // see Section A's rolls (docs/012's core section-scoping requirement).
    expect(nextRollNumber(rolls, 'Class 8', 'B', 1)).toBe(2)
  })

  it('starts a fresh combination at the increment', () => {
    expect(nextRollNumber(rolls, 'Class 10', 'A', 1)).toBe(1)
    expect(nextRollNumber(rolls, 'Class 10', 'A', 2)).toBe(2)
  })

  it('applies a configurable increment on top of the last roll', () => {
    expect(nextRollNumber(rolls, 'Class 9', 'A', 2)).toBe(11)
  })

  it('treats a null section the same as an empty-string section', () => {
    const withNullSection: RollRow[] = [{ class_name: 'Class 7', section: null, roll_number: 4 }]
    expect(nextRollNumber(withNullSection, 'Class 7', '', 1)).toBe(5)
  })

  it('floors the increment at 1', () => {
    expect(nextRollNumber(rolls, 'Class 10', 'A', 0)).toBe(1)
  })
})

describe('parseRollNumber', () => {
  it('treats a blank field as "no override"', () => {
    expect(parseRollNumber('')).toEqual({ value: null })
    expect(parseRollNumber('   ')).toEqual({ value: null })
  })

  it('accepts a positive whole number', () => {
    expect(parseRollNumber('7')).toEqual({ value: 7 })
  })

  it('rejects zero, negatives and decimals with a user-facing error', () => {
    expect(parseRollNumber('0').error).toBeTruthy()
    expect(parseRollNumber('-1').error).toBeTruthy()
    expect(parseRollNumber('5.5').error).toBeTruthy()
    expect(parseRollNumber('abc').error).toBeTruthy()
  })
})

describe('rollScopeChanged', () => {
  it('is false when class and section are unchanged', () => {
    expect(rollScopeChanged({ class_name: 'Class 8', section: 'A' }, { class_name: 'Class 8', section: 'A' })).toBe(
      false,
    )
  })

  it('is true when class or section changed', () => {
    expect(rollScopeChanged({ class_name: 'Class 8', section: 'A' }, { class_name: 'Class 9', section: 'A' })).toBe(
      true,
    )
    expect(rollScopeChanged({ class_name: 'Class 8', section: 'A' }, { class_name: 'Class 8', section: 'B' })).toBe(
      true,
    )
  })

  it('defaults to false when the current row could not be read', () => {
    expect(rollScopeChanged(null, { class_name: 'Class 8', section: 'A' })).toBe(false)
  })
})

describe('friendlyStudentError', () => {
  it('replaces a duplicate rfid_card_number violation with a legible message', () => {
    const error = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "students_rfid_card_number_key"',
    }
    expect(friendlyStudentError(error)).toBe('That RFID card number is already used by someone else at this school')
  })

  it('passes through any other error unchanged', () => {
    const notFound = { code: '23503', message: 'foreign key violation' }
    expect(friendlyStudentError(notFound)).toBe('foreign key violation')

    // A 23505 on a different constraint (e.g. students_roll_unique) must not
    // be swallowed into the rfid_card_number message.
    const otherUnique = { code: '23505', message: 'duplicate key value violates unique constraint "students_roll_unique"' }
    expect(friendlyStudentError(otherUnique)).toBe(otherUnique.message)
  })
})

describe('photoExtension', () => {
  it('maps the allowed image types', () => {
    expect(photoExtension('image/jpeg')).toBe('jpg')
    expect(photoExtension('image/png')).toBe('png')
    expect(photoExtension('image/webp')).toBe('webp')
  })

  it('rejects everything else', () => {
    expect(photoExtension('application/pdf')).toBeNull()
    expect(photoExtension('image/gif')).toBeNull()
  })
})

describe('subjectsForClass', () => {
  const subjects: SubjectOption[] = [
    { id: 's1', name: 'Bangla', class_id: null },
    { id: 's2', name: 'Class Elective', class_id: 'c1' },
    { id: 's3', name: 'Other Class Elective', class_id: 'c2' },
  ]

  it('includes school-wide subjects (class_id null) for any class', () => {
    const result = subjectsForClass(subjects, 'c1')
    expect(result.map((s) => s.id)).toContain('s1')
  })

  it('includes subjects linked to the given class', () => {
    const result = subjectsForClass(subjects, 'c1')
    expect(result.map((s) => s.id)).toContain('s2')
  })

  it('excludes subjects linked to a different class', () => {
    const result = subjectsForClass(subjects, 'c1')
    expect(result.map((s) => s.id)).not.toContain('s3')
  })

  it('returns an empty list for an empty catalogue', () => {
    expect(subjectsForClass([], 'c1')).toEqual([])
  })
})

describe('behaviourSmsBody', () => {
  it('mentions the student name and note', () => {
    const body = behaviourSmsBody('Rahim Uddin', 'Disrupted class', 3)
    expect(body).toContain('Rahim Uddin')
    expect(body).toContain('Disrupted class')
    expect(body).toContain('3')
  })

  it('truncates a long note so the SMS stays a reasonable length', () => {
    const longNote = 'x'.repeat(300)
    const body = behaviourSmsBody('Student', longNote, 5)
    expect(body.length).toBeLessThan(300)
  })
})

describe('studentLoginSmsBody (#442)', () => {
  it('carries the name, the username and the password', () => {
    const body = studentLoginSmsBody('Rahim Uddin', 's0007@greenwood.students.invalid', 'a1b2c3d4e5f6')
    expect(body).toContain('Rahim Uddin')
    expect(body).toContain('s0007@greenwood.students.invalid')
    expect(body).toContain('a1b2c3d4e5f6')
  })

  it('builds a stored copy with no password in it', () => {
    // The Send Log is readable by any staff member with the SMS screen, so the
    // logged copy must never be the one that went out.
    const stored = studentLoginSmsBody('Rahim Uddin', 's0007@greenwood.students.invalid', PASSWORD_MASK)
    expect(stored).not.toContain('a1b2c3d4e5f6')
    expect(stored).toContain(PASSWORD_MASK)
  })
})
