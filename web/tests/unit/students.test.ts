import { describe, it, expect } from 'vitest'
import {
  classSectionLabel,
  matchesStudentQuery,
  filterStudents,
  behaviourAverages,
  photoExtension,
  sectionsForClass,
  subjectsForClass,
  behaviourSmsBody,
  type StudentListRow,
  type SubjectOption,
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

describe('filterStudents', () => {
  const students = [
    row({ id: 'a', class_name: 'Class 8', section: 'A' }),
    row({ id: 'b', full_name: 'Tamim Iqbal', class_name: 'Class 8', section: 'B' }),
    row({ id: 'c', full_name: 'Sadia Islam', class_name: 'Class 7', section: 'B' }),
  ]

  it('combines query and class/section filters', () => {
    expect(filterStudents(students, '', 'Class 8', '').map((s) => s.id)).toEqual(['a', 'b'])
    expect(filterStudents(students, '', '', 'B').map((s) => s.id)).toEqual(['b', 'c'])
    expect(filterStudents(students, 'tamim', 'Class 8', 'B').map((s) => s.id)).toEqual(['b'])
    expect(filterStudents(students, 'tamim', 'Class 7', '')).toHaveLength(0)
  })
})

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
