import { describe, it, expect } from 'vitest'
import { subjectFullMarks, subjectObtained, groupByExam, toSubjectMark, type ResultRow } from '@/lib/student/results'

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
