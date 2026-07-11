import { describe, it, expect } from 'vitest'
import {
  resolveMemberWeights,
  combineBySum,
  combineByWeightedPercent,
  evaluateCombinedPercent,
  rankResults,
  type CombinationMember,
  type ExamSubjectMark,
  type ExamPercent,
  type RankableResult,
} from '@/lib/exam-results'
import type { GradeBand, GradingScheme } from '@/lib/grading'

const GPA_BANDS: GradeBand[] = [
  { label: 'A+', minPercent: 80, maxPercent: 100, gradePoint: 5 },
  { label: 'A', minPercent: 70, maxPercent: 79.99, gradePoint: 4 },
  { label: 'B', minPercent: 50, maxPercent: 69.99, gradePoint: 3 },
  { label: 'F', minPercent: 0, maxPercent: 32.99, gradePoint: 0 },
]

function scheme(over: Partial<GradingScheme> = {}): GradingScheme {
  return {
    schemeType: 'grade_point',
    passMarkPercent: 33,
    passRuleStrategy: 'individual',
    combineSubjectGroups: false,
    bands: GPA_BANDS,
    ...over,
  }
}

describe('resolveMemberWeights', () => {
  it('uses explicit weights unchanged when they already sum to 100', () => {
    const members: CombinationMember[] = [
      { examId: 'a', weightPercent: 40 },
      { examId: 'b', weightPercent: 60 },
    ]
    const weights = resolveMemberWeights(members)
    expect(weights.get('a')).toBe(40)
    expect(weights.get('b')).toBe(60)
  })

  it('assigns the remainder to the single blank member ("remainder auto-assigned")', () => {
    const members: CombinationMember[] = [
      { examId: 'a', weightPercent: 30 },
      { examId: 'b', weightPercent: 30 },
      { examId: 'c', weightPercent: null },
    ]
    const weights = resolveMemberWeights(members)
    expect(weights.get('c')).toBe(40)
  })

  it('treats a single all-blank member as absorbing 100%', () => {
    const weights = resolveMemberWeights([{ examId: 'a', weightPercent: null }])
    expect(weights.get('a')).toBe(100)
  })

  it('throws when more than one member is left without an explicit weight', () => {
    expect(() =>
      resolveMemberWeights([
        { examId: 'a', weightPercent: null },
        { examId: 'b', weightPercent: null },
      ]),
    ).toThrow(/one exam/)
  })

  it('throws when explicit weights already exceed 100%', () => {
    expect(() =>
      resolveMemberWeights([
        { examId: 'a', weightPercent: 70 },
        { examId: 'b', weightPercent: 40 },
      ]),
    ).toThrow(/exceed 100/)
  })

  it('throws when every member has an explicit weight but they fall short of 100%', () => {
    expect(() =>
      resolveMemberWeights([
        { examId: 'a', weightPercent: 40 },
        { examId: 'b', weightPercent: 40 },
      ]),
    ).toThrow(/sum to 100/)
  })
})

describe('combineBySum', () => {
  it('adds full and obtained marks for the same subject across member exams', () => {
    const marks: ExamSubjectMark[] = [
      { examId: 'term1', subjectId: 'bangla', fullMarks: 100, obtainedMarks: 70 },
      { examId: 'term2', subjectId: 'bangla', fullMarks: 100, obtainedMarks: 80 },
      { examId: 'term1', subjectId: 'english', fullMarks: 100, obtainedMarks: 60 },
    ]
    const out = combineBySum(marks)
    expect(out).toContainEqual({ subjectId: 'bangla', fullMarks: 200, obtainedMarks: 150, isOptional: false })
    expect(out).toContainEqual({ subjectId: 'english', fullMarks: 100, obtainedMarks: 60, isOptional: false })
  })

  it('a combined subject is optional only when every contributing mark was optional', () => {
    const mixed: ExamSubjectMark[] = [
      { examId: 'term1', subjectId: 'fourth', fullMarks: 100, obtainedMarks: 80, isOptional: true },
      { examId: 'term2', subjectId: 'fourth', fullMarks: 100, obtainedMarks: 90, isOptional: false },
    ]
    expect(combineBySum(mixed)[0].isOptional).toBe(false)

    const bothOptional: ExamSubjectMark[] = [
      { examId: 'term1', subjectId: 'fourth', fullMarks: 100, obtainedMarks: 80, isOptional: true },
      { examId: 'term2', subjectId: 'fourth', fullMarks: 100, obtainedMarks: 90, isOptional: true },
    ]
    expect(combineBySum(bothOptional)[0].isOptional).toBe(true)
  })

  it('is empty for an empty input', () => {
    expect(combineBySum([])).toEqual([])
  })
})

describe('combineByWeightedPercent', () => {
  it('scales each exam percent by its resolved weight and sums', () => {
    const percents: ExamPercent[] = [
      { examId: 'term1', percent: 60 },
      { examId: 'term2', percent: 80 },
    ]
    const weights = new Map([
      ['term1', 40],
      ['term2', 60],
    ])
    // 60*0.4 + 80*0.6 = 24 + 48 = 72
    expect(combineByWeightedPercent(percents, weights)).toBe(72)
  })

  it('an exam missing from the weight map contributes nothing', () => {
    const percents: ExamPercent[] = [{ examId: 'unweighted', percent: 90 }]
    expect(combineByWeightedPercent(percents, new Map())).toBe(0)
  })
})

describe('evaluateCombinedPercent', () => {
  it('grade_point scheme: passing percent resolves a band label and GPA', () => {
    const out = evaluateCombinedPercent(85, scheme())
    expect(out).toEqual({ passed: true, percent: 85, gpa: 5, label: 'A+' })
  })

  it('grade_point scheme: failing percent is GPA 0, labelled F', () => {
    const out = evaluateCombinedPercent(20, scheme())
    expect(out).toEqual({ passed: false, percent: 20, gpa: 0, label: 'F' })
  })

  it('letter scheme: no GPA either way', () => {
    const out = evaluateCombinedPercent(85, scheme({ schemeType: 'letter' }))
    expect(out.gpa).toBeNull()
    expect(out.label).toBe('A+')
    const fail = evaluateCombinedPercent(10, scheme({ schemeType: 'letter' }))
    expect(fail.gpa).toBeNull()
    expect(fail.label).toBe('F')
  })

  it('numeric scheme: no label or GPA, pass/fail only', () => {
    const out = evaluateCombinedPercent(50, scheme({ schemeType: 'numeric' }))
    expect(out).toEqual({ passed: true, percent: 50, gpa: null, label: null })
  })
})

function result(over: Partial<RankableResult> = {}): RankableResult {
  return { studentId: 'x', passed: true, gpa: 4, percent: 80, ...over }
}

describe('rankResults', () => {
  it('ranks passed students by descending GPA on the grade basis', () => {
    const results = [
      result({ studentId: 'a', gpa: 4.5, percent: 88 }),
      result({ studentId: 'b', gpa: 5, percent: 91 }),
      result({ studentId: 'c', gpa: 3.5, percent: 65 }),
    ]
    const ranked = rankResults(results, 'grade')
    expect(ranked.find((r) => r.studentId === 'b')?.position).toBe(1)
    expect(ranked.find((r) => r.studentId === 'a')?.position).toBe(2)
    expect(ranked.find((r) => r.studentId === 'c')?.position).toBe(3)
  })

  it('ranks passed students by descending percent on the mark basis', () => {
    const results = [
      result({ studentId: 'a', gpa: 5, percent: 70 }),
      result({ studentId: 'b', gpa: 4, percent: 95 }),
    ]
    const ranked = rankResults(results, 'mark')
    expect(ranked.find((r) => r.studentId === 'b')?.position).toBe(1)
    expect(ranked.find((r) => r.studentId === 'a')?.position).toBe(2)
  })

  it('ties on the ranking basis share a position, and the next rank skips the tied count (1224)', () => {
    const results = [
      result({ studentId: 'a', gpa: 5, percent: 92 }),
      result({ studentId: 'b', gpa: 5, percent: 90 }),
      result({ studentId: 'c', gpa: 3, percent: 60 }),
    ]
    const ranked = rankResults(results, 'grade')
    expect(ranked.find((r) => r.studentId === 'a')?.position).toBe(1)
    expect(ranked.find((r) => r.studentId === 'b')?.position).toBe(1)
    expect(ranked.find((r) => r.studentId === 'c')?.position).toBe(3)
  })

  it('failed students always get position null, sorted after all passed students', () => {
    const results = [result({ studentId: 'pass', passed: true }), result({ studentId: 'fail', passed: false })]
    const ranked = rankResults(results, 'mark')
    expect(ranked.find((r) => r.studentId === 'fail')?.position).toBeNull()
    expect(ranked.find((r) => r.studentId === 'pass')?.position).toBe(1)
  })

  it('an empty result list ranks to an empty list', () => {
    expect(rankResults([], 'mark')).toEqual([])
  })
})
