import { describe, it, expect } from 'vitest'
import { assembleRosterRows, type RosterStudent } from '@/lib/exam-print-data'
import type { GradeBand, GradingScheme } from '@/lib/grading'

// The assembly that used to be locked inside loadExamRosterResults' Supabase
// call (arch review #6). These fixtures-in / rows-out tests cover the glue that
// carries the real bugs: totals, ranking across the roster, subject-name
// mapping, missing-marks defaults and optional-subject flagging.

const BANDS: GradeBand[] = [
  { label: 'A+', minPercent: 80, maxPercent: 100, gradePoint: 5 },
  { label: 'A', minPercent: 60, maxPercent: 79.99, gradePoint: 4 },
  { label: 'B', minPercent: 40, maxPercent: 59.99, gradePoint: 3 },
  { label: 'F', minPercent: 0, maxPercent: 32.99, gradePoint: 0 },
]

const scheme: GradingScheme = {
  schemeType: 'grade_point',
  passMarkPercent: 33,
  passRuleStrategy: 'individual',
  combineSubjectGroups: false,
  bands: BANDS,
}

const subjects = [
  { id: 'ban', name: 'Bangla', theory_marks: 70, mcq_marks: 30, practical_marks: 0 },
  { id: 'math', name: 'Math', theory_marks: 100, mcq_marks: 0, practical_marks: 0 },
]

const roster: RosterStudent[] = [
  { id: 's1', full_name: 'Karim', roll_number: 1, guardian_name: 'A' },
  { id: 's2', full_name: 'Rahim', roll_number: 2, guardian_name: 'B' },
]

function marks(pairs: [string, number][]): Map<string, number> {
  return new Map(pairs)
}

describe('assembleRosterRows', () => {
  it('sums totals per student and maps subject names', () => {
    const rows = assembleRosterRows(
      subjects,
      roster,
      marks([
        ['s1:ban', 80],
        ['s1:math', 90],
        ['s2:ban', 40],
        ['s2:math', 50],
      ]),
      new Map(),
      scheme,
      'grade',
    )
    const s1 = rows.find((r) => r.studentId === 's1')!
    expect(s1.totalFull).toBe(200) // 100 + 100
    expect(s1.totalObtained).toBe(170)
    expect(s1.subjectResults.map((r) => r.subjectName)).toEqual(['Bangla', 'Math'])
  })

  it('ranks the higher aggregate first and reports the roster size', () => {
    const rows = assembleRosterRows(
      subjects,
      roster,
      marks([
        ['s1:ban', 80],
        ['s1:math', 90], // 170
        ['s2:ban', 40],
        ['s2:math', 50], // 90
      ]),
      new Map(),
      scheme,
      'grade',
    )
    const s1 = rows.find((r) => r.studentId === 's1')!
    const s2 = rows.find((r) => r.studentId === 's2')!
    expect(s1.rankPosition).toBe(1)
    expect(s2.rankPosition).toBe(2)
    expect(s1.rankOutOf).toBe(2)
  })

  it('defaults a missing mark to 0 rather than dropping the subject', () => {
    const rows = assembleRosterRows(
      subjects,
      [roster[0]],
      marks([['s1:ban', 55]]), // no math mark
      new Map(),
      scheme,
      'grade',
    )
    const s1 = rows[0]
    expect(s1.subjectResults).toHaveLength(2)
    const math = s1.subjectResults.find((r) => r.subjectId === 'math')!
    expect(math.result.obtainedMarks).toBe(0)
  })

  it('threads the optional-subject flag into each subject result', () => {
    const rows = assembleRosterRows(
      subjects,
      [roster[0]],
      marks([
        ['s1:ban', 80],
        ['s1:math', 80],
      ]),
      new Map([['s1:math', true]]),
      scheme,
      'grade',
    )
    const math = rows[0].subjectResults.find((r) => r.subjectId === 'math')!
    expect(math.result.isOptional).toBe(true)
  })
})
