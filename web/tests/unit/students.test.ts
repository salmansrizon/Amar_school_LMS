import { describe, it, expect } from 'vitest'
import { subjectsForClass, behaviourSmsBody, type SubjectOption } from '@/lib/students'

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
