import { describe, it, expect } from 'vitest'
import { subjectFullMarks, subjectObtained, groupByExam, toSubjectMark, missingSubjects, type ResultRow } from '@/lib/student/results'

const row = (over: Partial<ResultRow> & { exam_id: string; subject_id: string }): ResultRow => ({
  exam_name: over.exam_id,
  exam_year: 2026,
  results_published_at: '2026-08-01T00:00:00Z',
  grading_scheme_id: 'scheme',
  subject_name: over.subject_id,
  subject_theory_total: 70,
  subject_mcq_total: 30,
  subject_practical_total: 0,
  theory_obtained: 50,
  mcq_obtained: 20,
  practical_obtained: null,
  obtained_marks: null,
  ...over,
})

describe('subjectFullMarks', () => {
  it('sums the three configured components', () => {
    expect(subjectFullMarks(row({ exam_id: 'e', subject_id: 's' }))).toBe(100)
  })

  it('ignores a component the school set to zero', () => {
    const r = row({ exam_id: 'e', subject_id: 's', subject_mcq_total: 0, subject_practical_total: 0 })
    expect(subjectFullMarks(r)).toBe(70)
  })
})

describe('subjectObtained', () => {
  it('trusts the stored total — it is what every other screen reports', () => {
    const r = row({ exam_id: 'e', subject_id: 's', obtained_marks: 88 })
    expect(subjectObtained(r)).toBe(88)
  })

  it('falls back to summing the components when no total is stored', () => {
    expect(subjectObtained(row({ exam_id: 'e', subject_id: 's' }))).toBe(70)
  })

  it('treats a missing component as zero, not as a break', () => {
    const r = row({ exam_id: 'e', subject_id: 's', theory_obtained: null, mcq_obtained: null })
    expect(subjectObtained(r)).toBe(0)
  })
})

describe('toSubjectMark', () => {
  it('produces exactly what lib/grading.ts accepts', () => {
    expect(toSubjectMark(row({ exam_id: 'e', subject_id: 'maths' }))).toEqual({
      subjectId: 'maths',
      fullMarks: 100,
      obtainedMarks: 70,
    })
  })
})

describe('groupByExam', () => {
  it('groups rows and puts the newest year first', () => {
    const exams = groupByExam([
      row({ exam_id: 'old', subject_id: 'a', exam_year: 2024 }),
      row({ exam_id: 'new', subject_id: 'a', exam_year: 2026 }),
      row({ exam_id: 'new', subject_id: 'b', exam_year: 2026 }),
    ])
    expect(exams.map((e) => e.examId)).toEqual(['new', 'old'])
    expect(exams[0].rows).toHaveLength(2)
  })
})

// The portal's incomplete state: a subject of the Student's class the exam
// holds no mark for. student_exam_result never carries such a subject.
describe('missingSubjects', () => {
  const classSubjects = [
    { id: 'bn', name: 'Bangla' },
    { id: 'en', name: 'English' },
    { id: 'ma', name: 'Math' },
  ]
  const examWith = (...subjectIds: string[]) =>
    groupByExam(subjectIds.map((subject_id) => row({ exam_id: 'e1', subject_id })))[0]

  it('is empty when every subject of the class has a mark — a complete result is untouched', () => {
    expect(missingSubjects(examWith('bn', 'en', 'ma'), classSubjects)).toEqual([])
  })

  it('names the subjects with no mark entered', () => {
    expect(missingSubjects(examWith('bn'), classSubjects)).toEqual([
      { id: 'en', name: 'English' },
      { id: 'ma', name: 'Math' },
    ])
  })

  it('does not judge an exam of an earlier class, whose subjects are not the current class\'s', () => {
    expect(missingSubjects(examWith('old-bn', 'old-en'), classSubjects)).toEqual([])
  })

  it('is empty when the class subject list could not be read', () => {
    expect(missingSubjects(examWith('bn'), [])).toEqual([])
  })
})
