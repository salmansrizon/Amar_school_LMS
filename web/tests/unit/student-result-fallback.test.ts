import { describe, expect, it } from 'vitest'
import { rawResult, resultMode } from '@/lib/student/result-fallback'
import { evaluateExam, groupByExam, type ResultRow } from '@/lib/student/results'
import type { GradingScheme } from '@/lib/grading'

const row = (subject_id: string, subject_name: string, obtained: number, full = 100): ResultRow => ({
  exam_id: 'e1', exam_name: 'UAT Exam', exam_year: 2026, results_published_at: '2026-10-01T00:00:00Z',
  grading_scheme_id: 's1', subject_id, subject_name,
  subject_theory_total: full, subject_mcq_total: 0, subject_practical_total: 0,
  theory_obtained: obtained, mcq_obtained: null, practical_obtained: null, obtained_marks: obtained,
})
const exam = (rows: ResultRow[]) => groupByExam(rows)[0]
const classSubjects = [{ id: 'p', name: 'Physics' }, { id: 'm', name: 'Maths' }]

describe('rawResult', () => {
  it('shows each subject and the raw total', () => {
    const r = rawResult(exam([row('p', 'Physics', 72), row('m', 'Maths', 80)]), classSubjects)
    expect(r.subjects.map((s) => [s.name, s.obtained, s.full])).toEqual([['Physics', 72, 100], ['Maths', 80, 100]])
    expect(r.total).toEqual({ obtained: 152, full: 200 })
    expect(r.missing).toEqual([])
    expect(r.showRank).toBe(true)
  })

  it('names a missing subject and hides the rank', () => {
    const r = rawResult(exam([row('p', 'Physics', 72)]), classSubjects)
    expect(r.missing).toEqual([{ id: 'm', name: 'Maths' }])
    expect(r.showRank).toBe(false)
    expect(r.total).toEqual({ obtained: 72, full: 100 })
  })

  it('reads as complete when class subjects are unknown', () => {
    expect(rawResult(exam([row('p', 'Physics', 72)]), []).showRank).toBe(true)
  })
})

describe('resultMode', () => {
  const scheme: GradingScheme = {
    schemeType: 'grade_point',
    passMarkPercent: 33,
    passRuleStrategy: 'individual',
    combineSubjectGroups: false,
    bands: [
      { label: 'A+', minPercent: 80, maxPercent: 100, gradePoint: 5 },
      { label: 'F', minPercent: 0, maxPercent: 79.99, gradePoint: 0 },
    ],
  }
  it('is raw only when the scheme could not be read', () => {
    expect(resultMode(null)).toBe('raw')
    expect(resultMode(scheme)).toBe('graded')
  })
  it('leaves the graded evaluation to lib/grading', () => {
    const ev = evaluateExam(exam([row('p', 'Physics', 90)]), scheme)
    expect(ev.subjects[0].label).toBe('A+')
  })
})
