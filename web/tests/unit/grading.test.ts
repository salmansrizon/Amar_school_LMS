import { describe, it, expect } from 'vitest'
import {
  subjectPercent,
  resolveGradeBand,
  bandOverlaps,
  combineSubjectGroup,
  applySubjectGroups,
  evaluateSubject,
  evaluateOverallResult,
  type GradeBand,
  type GradingScheme,
  type SubjectMark,
  type SubjectResult,
} from '@/lib/grading'

// Bangladesh SSC-style GPA bands (standard reference table for the grade_point
// scheme type tests below).
const GPA_BANDS: GradeBand[] = [
  { label: 'A+', minPercent: 80, maxPercent: 100, gradePoint: 5 },
  { label: 'A', minPercent: 70, maxPercent: 79.99, gradePoint: 4 },
  { label: 'A-', minPercent: 60, maxPercent: 69.99, gradePoint: 3.5 },
  { label: 'B', minPercent: 50, maxPercent: 59.99, gradePoint: 3 },
  { label: 'C', minPercent: 40, maxPercent: 49.99, gradePoint: 2 },
  { label: 'D', minPercent: 33, maxPercent: 39.99, gradePoint: 1 },
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

function mark(over: Partial<SubjectMark> = {}): SubjectMark {
  return { subjectId: 'bangla', fullMarks: 100, obtainedMarks: 88, ...over }
}

describe('subjectPercent', () => {
  it('computes a rounded percentage', () => {
    expect(subjectPercent(88, 100)).toBe(88)
    expect(subjectPercent(44, 50)).toBe(88)
    expect(subjectPercent(1, 3)).toBe(33.33)
  })

  it('guards against a zero (or negative) full-marks denominator', () => {
    expect(subjectPercent(10, 0)).toBe(0)
    expect(subjectPercent(0, 0)).toBe(0)
  })
})

describe('resolveGradeBand', () => {
  it('finds the band that contains the percent, inclusive of both edges', () => {
    expect(resolveGradeBand(GPA_BANDS, 80)?.label).toBe('A+')
    expect(resolveGradeBand(GPA_BANDS, 79.99)?.label).toBe('A')
    expect(resolveGradeBand(GPA_BANDS, 0)?.label).toBe('F')
    expect(resolveGradeBand(GPA_BANDS, 100)?.label).toBe('A+')
  })

  it('returns null when no configured band covers the percent', () => {
    expect(resolveGradeBand([{ label: 'A+', minPercent: 80, maxPercent: 100, gradePoint: 5 }], 50)).toBeNull()
  })

  it('returns null for an empty band list', () => {
    expect(resolveGradeBand([], 50)).toBeNull()
  })
})

describe('bandOverlaps', () => {
  it('detects an overlapping range', () => {
    expect(bandOverlaps(GPA_BANDS, { minPercent: 65, maxPercent: 75 })).toBe(true)
  })

  it('detects an identical or contained range as overlapping', () => {
    expect(bandOverlaps(GPA_BANDS, { minPercent: 80, maxPercent: 100 })).toBe(true)
    expect(bandOverlaps(GPA_BANDS, { minPercent: 85, maxPercent: 90 })).toBe(true)
  })

  it('adjacent, touching-but-not-crossing ranges do not overlap', () => {
    // F is 0-32.99; a new band starting exactly at 33 should not overlap it.
    const fOnly = [GPA_BANDS.find((b) => b.label === 'F')!]
    expect(bandOverlaps(fOnly, { minPercent: 33, maxPercent: 39.99 })).toBe(false)
  })

  it('an empty band list never overlaps', () => {
    expect(bandOverlaps([], { minPercent: 0, maxPercent: 100 })).toBe(false)
  })
})

describe('combineSubjectGroup', () => {
  it('sums full and obtained marks across the group members', () => {
    expect(
      combineSubjectGroup([
        { fullMarks: 50, obtainedMarks: 40 },
        { fullMarks: 50, obtainedMarks: 45 },
      ]),
    ).toEqual({ fullMarks: 100, obtainedMarks: 85 })
  })

  it('is zero for an empty group', () => {
    expect(combineSubjectGroup([])).toEqual({ fullMarks: 0, obtainedMarks: 0 })
  })
})

describe('applySubjectGroups', () => {
  const marks: SubjectMark[] = [
    { subjectId: 'bangla-1', fullMarks: 50, obtainedMarks: 40 },
    { subjectId: 'bangla-2', fullMarks: 50, obtainedMarks: 45 },
    { subjectId: 'english', fullMarks: 100, obtainedMarks: 70 },
  ]

  it('passes ungrouped subjects through unchanged when there are no groups', () => {
    expect(applySubjectGroups(marks, [])).toEqual(marks)
  })

  it('collapses a named group into one combined synthetic subject-mark', () => {
    const out = applySubjectGroups(marks, [{ name: 'bangla', subjectIds: ['bangla-1', 'bangla-2'] }])
    expect(out).toContainEqual({ subjectId: 'bangla', fullMarks: 100, obtainedMarks: 85, isOptional: false })
    // ungrouped subject passes through
    expect(out).toContainEqual(marks[2])
    expect(out).toHaveLength(2)
  })

  it('marks the combined row optional only when every member is optional', () => {
    const optionalMarks: SubjectMark[] = [
      { subjectId: 'a', fullMarks: 50, obtainedMarks: 40, isOptional: true },
      { subjectId: 'b', fullMarks: 50, obtainedMarks: 40, isOptional: false },
    ]
    const out = applySubjectGroups(optionalMarks, [{ name: 'group', subjectIds: ['a', 'b'] }])
    expect(out[0].isOptional).toBe(false)

    const bothOptional: SubjectMark[] = [
      { subjectId: 'a', fullMarks: 50, obtainedMarks: 40, isOptional: true },
      { subjectId: 'b', fullMarks: 50, obtainedMarks: 40, isOptional: true },
    ]
    const out2 = applySubjectGroups(bothOptional, [{ name: 'group', subjectIds: ['a', 'b'] }])
    expect(out2[0].isOptional).toBe(true)
  })
})

describe('evaluateSubject', () => {
  it('grade_point scheme: reports percent, pass, band label and grade point', () => {
    const r = evaluateSubject(mark(), scheme())
    expect(r).toMatchObject({ subjectId: 'bangla', percent: 88, passed: true, label: 'A+', gradePoint: 5 })
  })

  it('letter scheme: reports a label but no grade point', () => {
    const r = evaluateSubject(mark({ obtainedMarks: 55 }), scheme({ schemeType: 'letter' }))
    expect(r.label).toBe('B')
    expect(r.gradePoint).toBeNull()
  })

  it('numeric scheme: no band lookup at all — no label, no grade point', () => {
    const r = evaluateSubject(mark({ obtainedMarks: 55 }), scheme({ schemeType: 'numeric', bands: [] }))
    expect(r.label).toBeNull()
    expect(r.gradePoint).toBeNull()
    expect(r.percent).toBe(55)
  })

  it('a subject under the pass mark fails regardless of scheme type', () => {
    const r = evaluateSubject(mark({ obtainedMarks: 20 }), scheme())
    expect(r.passed).toBe(false)
    expect(r.label).toBe('F')
  })

  it('carries the isOptional flag through (defaulting to false)', () => {
    expect(evaluateSubject(mark(), scheme()).isOptional).toBe(false)
    expect(evaluateSubject(mark({ isOptional: true }), scheme()).isOptional).toBe(true)
  })
})

function result(over: Partial<SubjectResult> = {}): SubjectResult {
  return {
    subjectId: 'x',
    fullMarks: 100,
    obtainedMarks: 80,
    percent: 80,
    passed: true,
    label: 'A+',
    gradePoint: 5,
    isOptional: false,
    ...over,
  }
}

describe('evaluateOverallResult — individual pass-rule strategy', () => {
  it('passes when every subject (compulsory and optional) passes; GPA is the average', () => {
    const results = [
      result({ subjectId: 'bangla', gradePoint: 5, percent: 88 }),
      result({ subjectId: 'english', gradePoint: 4, percent: 75, label: 'A' }),
    ]
    const out = evaluateOverallResult(results, scheme({ passRuleStrategy: 'individual' }))
    expect(out.passed).toBe(true)
    expect(out.gpa).toBe(4.5)
  })

  it('one failing subject (including an optional one) fails the whole result — GPA 0.00', () => {
    const results = [
      result({ subjectId: 'bangla', passed: true }),
      result({ subjectId: 'fourth', passed: false, percent: 10, gradePoint: 0, label: 'F', isOptional: true }),
    ]
    const out = evaluateOverallResult(results, scheme({ passRuleStrategy: 'individual' }))
    expect(out.passed).toBe(false)
    expect(out.gpa).toBe(0)
    expect(out.label).toBe('F')
  })
})

describe('evaluateOverallResult — combined_average pass-rule strategy', () => {
  it('passes on the aggregate weighted-average percent even if one subject individually failed', () => {
    const results = [
      result({ subjectId: 'bangla', fullMarks: 100, obtainedMarks: 90, passed: true }),
      result({ subjectId: 'english', fullMarks: 100, obtainedMarks: 20, passed: false, gradePoint: 0, label: 'F' }),
    ]
    // aggregate = 110/200 = 55% >= 33% pass mark
    const out = evaluateOverallResult(results, scheme({ passRuleStrategy: 'combined_average' }))
    expect(out.passed).toBe(true)
    expect(out.percent).toBe(55)
  })

  it('fails when the aggregate weighted-average itself is under the pass mark — GPA 0.00', () => {
    const results = [
      result({ subjectId: 'bangla', fullMarks: 100, obtainedMarks: 10, passed: false, gradePoint: 0, label: 'F' }),
      result({ subjectId: 'english', fullMarks: 100, obtainedMarks: 15, passed: false, gradePoint: 0, label: 'F' }),
    ]
    const out = evaluateOverallResult(results, scheme({ passRuleStrategy: 'combined_average' }))
    expect(out.passed).toBe(false)
    expect(out.gpa).toBe(0)
  })
})

describe('evaluateOverallResult — optional_conditional pass-rule strategy', () => {
  const compulsory = [
    result({ subjectId: 'bangla', gradePoint: 5, percent: 88 }),
    result({ subjectId: 'english', gradePoint: 4, percent: 75, label: 'A' }),
  ]

  it('a failing optional subject is auto-passed — overall still passes, but GPA is deducted', () => {
    const results = [
      ...compulsory,
      result({ subjectId: 'fourth', passed: false, percent: 10, gradePoint: 0, label: 'F', isOptional: true }),
    ]
    const out = evaluateOverallResult(results, scheme({ passRuleStrategy: 'optional_conditional' }))
    expect(out.passed).toBe(true)
    // base = (5 + 4) / 2 = 4.5; deduction = 1 point spread over 2 compulsory subjects
    // -> (9 - 1) / 2 = 4.00 (PRD §5.5 "grade deduction" half of the optional-subject rule).
    expect(out.gpa).toBe(4)
  })

  it("a passing optional subject above 2.00 GPA adds the excess as bonus, capped at the scheme's top grade point", () => {
    const results = [
      ...compulsory,
      result({ subjectId: 'fourth', passed: true, percent: 90, gradePoint: 5, label: 'A+', isOptional: true }),
    ]
    const out = evaluateOverallResult(results, scheme({ passRuleStrategy: 'optional_conditional' }))
    // base = (5 + 4) / 2 = 4.5; bonus = 5 - 2 = 3 spread over 2 compulsory subjects
    // -> (9 + 3) / 2 = 6.00, but capped at 5.00 (the highest grade point in GPA_BANDS).
    expect(out.gpa).toBe(5)
  })

  it('an optional subject at or below 2.00 GPA contributes no bonus', () => {
    const results = [
      ...compulsory,
      result({ subjectId: 'fourth', passed: true, percent: 45, gradePoint: 2, label: 'C', isOptional: true }),
    ]
    const out = evaluateOverallResult(results, scheme({ passRuleStrategy: 'optional_conditional' }))
    expect(out.gpa).toBe(4.5)
  })

  it('a failing compulsory subject still fails the overall result regardless of optional subjects', () => {
    const results = [
      result({ subjectId: 'bangla', passed: false, percent: 10, gradePoint: 0, label: 'F' }),
      compulsory[1],
      result({ subjectId: 'fourth', passed: true, percent: 90, gradePoint: 5, isOptional: true }),
    ]
    const out = evaluateOverallResult(results, scheme({ passRuleStrategy: 'optional_conditional' }))
    expect(out.passed).toBe(false)
    expect(out.gpa).toBe(0)
  })
})

describe('evaluateOverallResult — non grade_point scheme types', () => {
  it('letter scheme: gpa is always null, label comes from the aggregate percent band', () => {
    const results = [
      result({ subjectId: 'bangla', fullMarks: 100, obtainedMarks: 90, label: 'A+', gradePoint: null }),
      result({ subjectId: 'english', fullMarks: 100, obtainedMarks: 70, label: 'A', gradePoint: null }),
    ]
    const out = evaluateOverallResult(results, scheme({ schemeType: 'letter', passRuleStrategy: 'individual' }))
    expect(out.gpa).toBeNull()
    expect(out.label).toBe('A+') // aggregate 80% -> A+ band
  })

  it('letter scheme failure: label comes from the school-configured fail band, never hardcoded', () => {
    const results = [
      result({ subjectId: 'bangla', fullMarks: 100, obtainedMarks: 10, passed: false, label: 'F', gradePoint: null }),
      result({ subjectId: 'english', fullMarks: 100, obtainedMarks: 15, passed: false, label: 'F', gradePoint: null }),
    ]
    const out = evaluateOverallResult(results, scheme({ schemeType: 'letter', passRuleStrategy: 'individual' }))
    expect(out.passed).toBe(false)
    expect(out.gpa).toBeNull()
    expect(out.label).toBe('F') // aggregate 12.5% resolves to the school's own F band, not a hardcoded literal
  })

  it('numeric scheme: gpa and label are always null even if bands happen to be configured', () => {
    const results = [result({ fullMarks: 100, obtainedMarks: 90, label: null, gradePoint: null })]
    const out = evaluateOverallResult(
      results,
      scheme({ schemeType: 'numeric', bands: GPA_BANDS, passRuleStrategy: 'individual' }),
    )
    expect(out.gpa).toBeNull()
    expect(out.label).toBeNull()
    expect(out.percent).toBe(90)
  })
})

describe('evaluateOverallResult — GPA deduction never goes negative', () => {
  it('multiple failing optional subjects floor the GPA at 0 instead of going negative', () => {
    const compulsoryLow = [
      result({ subjectId: 'bangla', gradePoint: 1, percent: 35, label: 'D' }),
      result({ subjectId: 'english', gradePoint: 1, percent: 35, label: 'D' }),
    ]
    const results = [
      ...compulsoryLow,
      result({ subjectId: 'third', passed: false, percent: 10, gradePoint: 0, label: 'F', isOptional: true }),
      result({ subjectId: 'fourth', passed: false, percent: 10, gradePoint: 0, label: 'F', isOptional: true }),
    ]
    const out = evaluateOverallResult(results, scheme({ passRuleStrategy: 'optional_conditional' }))
    // base = (1 + 1) / 2 = 1.00; deduction = 2 points spread over 2 -> 1.00 - 1.00 = 0.00
    expect(out.gpa).toBe(0)
    expect(out.passed).toBe(true) // still auto-passed; only the GPA is floored
  })
})
