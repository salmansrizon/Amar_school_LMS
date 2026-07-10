// Exams I: grading schemes & pass rules (issue #31, PRD §5.5). Pure combine-
// and-evaluate domain logic — no DB access — so the dense scoring rules get
// their own thorough unit-test pass, independent of the exam-setup UI (#47)
// that will wire marks entry to these functions.

export type SchemeType = 'grade_point' | 'letter' | 'numeric'
export type PassRuleStrategy = 'individual' | 'combined_average' | 'optional_conditional'

export interface GradeBand {
  label: string
  minPercent: number
  maxPercent: number
  gradePoint: number | null
}

export interface GradingScheme {
  schemeType: SchemeType
  passMarkPercent: number
  passRuleStrategy: PassRuleStrategy
  combineSubjectGroups: boolean
  bands: GradeBand[]
}

export interface SubjectMark {
  subjectId: string
  fullMarks: number
  obtainedMarks: number
  isOptional?: boolean
}

/** A combinable subject group (e.g. Bangla 1st + 2nd paper) collapsed into one
 * synthetic subject before evaluation, when the scheme has combining enabled. */
export interface SubjectGroup {
  name: string
  subjectIds: string[]
}

export interface SubjectResult {
  subjectId: string
  fullMarks: number
  obtainedMarks: number
  percent: number
  passed: boolean
  label: string | null
  gradePoint: number | null
  isOptional: boolean
}

export interface OverallResult {
  passed: boolean
  percent: number
  gpa: number | null
  label: string | null
}

/** Marks percentage, rounded to 2 decimals; 0 when fullMarks is zero or negative
 * (guards a div-by-zero on a mis-configured subject rather than throwing). */
export function subjectPercent(obtainedMarks: number, fullMarks: number): number {
  if (fullMarks <= 0) return 0
  return Math.round((obtainedMarks / fullMarks) * 10000) / 100
}

/** Finds the band whose [minPercent, maxPercent] contains `percent` (inclusive
 * both edges). First match wins if bands overlap. Null when unconfigured. */
export function resolveGradeBand(bands: GradeBand[], percent: number): GradeBand | null {
  return bands.find((b) => percent >= b.minPercent && percent <= b.maxPercent) ?? null
}

/** True when [minPercent, maxPercent] overlaps any band already in the list —
 * used to reject a new/edited grade band before it's saved (bands must
 * partition the 0-100 range without ambiguity for `resolveGradeBand`). */
export function bandOverlaps(
  bands: Pick<GradeBand, 'minPercent' | 'maxPercent'>[],
  candidate: Pick<GradeBand, 'minPercent' | 'maxPercent'>,
): boolean {
  return bands.some((b) => candidate.minPercent <= b.maxPercent && candidate.maxPercent >= b.minPercent)
}

/** Sums full/obtained marks across a subject group's members into one mark. */
export function combineSubjectGroup(
  marks: Pick<SubjectMark, 'fullMarks' | 'obtainedMarks'>[],
): { fullMarks: number; obtainedMarks: number } {
  return marks.reduce(
    (acc, m) => ({
      fullMarks: acc.fullMarks + m.fullMarks,
      obtainedMarks: acc.obtainedMarks + m.obtainedMarks,
    }),
    { fullMarks: 0, obtainedMarks: 0 },
  )
}

/** Applies each configured group's combine step: grouped subjects collapse into
 * one synthetic subject-mark (id = group name, marks summed); subjects outside
 * every group pass through unchanged. A combined row is optional only when
 * every member subject is optional (mirrors the "elective pair" case). */
export function applySubjectGroups(marks: SubjectMark[], groups: SubjectGroup[]): SubjectMark[] {
  if (!groups.length) return marks
  const grouped = new Set(groups.flatMap((g) => g.subjectIds))
  const passthrough = marks.filter((m) => !grouped.has(m.subjectId))
  const combinedRows = groups.map((g) => {
    const members = marks.filter((m) => g.subjectIds.includes(m.subjectId))
    const { fullMarks, obtainedMarks } = combineSubjectGroup(members)
    const isOptional = members.length > 0 && members.every((m) => m.isOptional)
    return { subjectId: g.name, fullMarks, obtainedMarks, isOptional }
  })
  return [...passthrough, ...combinedRows]
}

/** Per-subject percent/pass/band evaluation. Numeric schemes skip the band
 * lookup entirely — a numeric scheme reports raw marks/percent only, no
 * letter or grade-point conversion is meaningful for it. */
export function evaluateSubject(mark: SubjectMark, scheme: GradingScheme): SubjectResult {
  const percent = subjectPercent(mark.obtainedMarks, mark.fullMarks)
  const passed = percent >= scheme.passMarkPercent
  const band = scheme.schemeType === 'numeric' ? null : resolveGradeBand(scheme.bands, percent)
  return {
    subjectId: mark.subjectId,
    fullMarks: mark.fullMarks,
    obtainedMarks: mark.obtainedMarks,
    percent,
    passed,
    label: band?.label ?? null,
    gradePoint: scheme.schemeType === 'grade_point' ? (band?.gradePoint ?? null) : null,
    isOptional: mark.isOptional ?? false,
  }
}

// Legacy 4th/additional-subject GPA bonus rule: only the grade-point excess
// above this floor counts toward the overall GPA total.
const GPA_BONUS_FLOOR = 2

/**
 * Combine-and-evaluate: per-subject results (already through
 * `applySubjectGroups`/`evaluateSubject`) fold into one overall verdict per the
 * scheme's pass-rule strategy:
 *
 *  - `individual` ("must pass each subject individually"): every subject,
 *    compulsory or optional, must pass. Grade-point schemes report GPA 0.00 on
 *    any failure (the legacy "GPA 0 on any subject F" rule).
 *  - `combined_average` ("combined weighted-average basis"): pass/fail turns
 *    solely on the aggregate weighted-average percent (sum of obtained over
 *    sum of full marks, so a heavier subject counts for more) against the
 *    scheme's pass mark — individual subject failures don't matter on their
 *    own. Grade-point schemes likewise report GPA 0.00 when that aggregate
 *    itself falls under the pass mark.
 *  - `optional_conditional` ("optional-subject conditional auto-pass"):
 *    compulsory subjects must all pass, same as `individual`; an optional
 *    subject's failure is forgiven and never fails the result. A *passing*
 *    optional subject's grade point above 2.00 is added to the GPA total
 *    before averaging over the compulsory-subject count (the legacy
 *    4th/additional-subject GPA bonus); at or below 2.00 it contributes
 *    nothing either way.
 */
export function evaluateOverallResult(results: SubjectResult[], scheme: GradingScheme): OverallResult {
  const compulsory = results.filter((r) => !r.isOptional)
  const optional = results.filter((r) => r.isOptional)

  const totalFull = results.reduce((s, r) => s + r.fullMarks, 0)
  const totalObtained = results.reduce((s, r) => s + r.obtainedMarks, 0)
  const overallPercent = subjectPercent(totalObtained, totalFull)

  let passed: boolean
  switch (scheme.passRuleStrategy) {
    case 'combined_average':
      passed = overallPercent >= scheme.passMarkPercent
      break
    case 'optional_conditional':
      passed = compulsory.every((r) => r.passed)
      break
    case 'individual':
    default:
      passed = results.every((r) => r.passed)
      break
  }

  if (scheme.schemeType !== 'grade_point') {
    return {
      passed,
      percent: overallPercent,
      gpa: null,
      label: passed ? (resolveGradeBand(scheme.bands, overallPercent)?.label ?? null) : 'F',
    }
  }

  // For a grade_point scheme, the same condition that fails the overall
  // result also zeroes out the GPA — `passed` already encodes the right
  // failure condition per strategy (all-subjects for individual,
  // compulsory-only for optional_conditional, aggregate for combined_average).
  if (!passed) {
    return { passed: false, percent: overallPercent, gpa: 0, label: 'F' }
  }

  const basePoints = compulsory.reduce((s, r) => s + (r.gradePoint ?? 0), 0)
  let bonus = 0
  if (scheme.passRuleStrategy === 'optional_conditional') {
    for (const r of optional) {
      if (r.passed && r.gradePoint !== null && r.gradePoint > GPA_BONUS_FLOOR) {
        bonus += r.gradePoint - GPA_BONUS_FLOOR
      }
    }
  }
  const gpa = compulsory.length ? Math.round(((basePoints + bonus) / compulsory.length) * 100) / 100 : 0
  const label = resolveGradeBand(scheme.bands, overallPercent)?.label ?? null
  return { passed: true, percent: overallPercent, gpa, label }
}
