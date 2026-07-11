// Exams III (issue #32, PRD §5.5): multi-exam combination + merit ranking —
// pure domain logic, DB-free, mirroring the grading.ts / exam-setup.ts split
// so this dense math gets its own unit-test pass independent of the marks
// entry / promotion page wiring. Per-subject/overall evaluation itself is not
// reimplemented here — evaluateSubject/evaluateOverallResult (web/lib/grading.ts,
// issue #31) already covers that, including the "optional-subject rules"
// (grade deduction, conditional auto-pass) this ticket reuses rather than
// rebuilds.
import { resolveGradeBand, subjectPercent, type GradingScheme, type OverallResult } from './grading'

export type CombineStrategy = 'sum' | 'weighted_percentage'

export interface CombinationMember {
  examId: string
  weightPercent: number | null
}

/**
 * Resolves each member exam's effective weight for the 'weighted_percentage'
 * strategy (PRD §5.5 "remainder auto-assigned"): explicit weights are used
 * as-is; at most one member may leave weightPercent unset, and that one
 * silently absorbs whatever remains up to 100 — the "remainder" the PRD calls
 * out. Throws when the configuration can't resolve unambiguously (more than
 * one blank member, or explicit weights already over 100, or under 100 with
 * no blank member to absorb the rest).
 */
export function resolveMemberWeights(members: CombinationMember[]): Map<string, number> {
  const explicit = members.filter((m) => m.weightPercent !== null)
  const blank = members.filter((m) => m.weightPercent === null)
  if (blank.length > 1) {
    throw new Error('At most one exam in a combination may be left without an explicit weight')
  }
  const explicitTotal = Math.round(explicit.reduce((s, m) => s + (m.weightPercent ?? 0), 0) * 100) / 100
  if (explicitTotal > 100) {
    throw new Error('Combination weights exceed 100%')
  }
  const weights = new Map<string, number>()
  for (const m of explicit) weights.set(m.examId, m.weightPercent as number)
  if (blank.length === 1) {
    weights.set(blank[0].examId, Math.round((100 - explicitTotal) * 100) / 100)
  } else if (explicitTotal !== 100) {
    throw new Error('Combination weights must sum to 100% when every exam has an explicit weight')
  }
  return weights
}

export interface ExamSubjectMark {
  examId: string
  subjectId: string
  fullMarks: number
  obtainedMarks: number
  isOptional?: boolean
}

export interface CombinedSubjectMark {
  subjectId: string
  fullMarks: number
  obtainedMarks: number
  isOptional: boolean
}

/**
 * 'sum' strategy: marks for the same subject across every member exam add
 * together, as if the member exams were one mega-exam — the school's simplest
 * "combine 1st + 2nd term" case. A subject is optional in the combined view
 * only if every mark for it (across every member exam that examined it) was
 * optional, mirroring applySubjectGroups' "every member optional" rule.
 */
export function combineBySum(marks: ExamSubjectMark[]): CombinedSubjectMark[] {
  const bySubject = new Map<string, CombinedSubjectMark>()
  for (const m of marks) {
    const acc = bySubject.get(m.subjectId) ?? { subjectId: m.subjectId, fullMarks: 0, obtainedMarks: 0, isOptional: true }
    acc.fullMarks += m.fullMarks
    acc.obtainedMarks += m.obtainedMarks
    acc.isOptional = acc.isOptional && (m.isOptional ?? false)
    bySubject.set(m.subjectId, acc)
  }
  return [...bySubject.values()]
}

export interface ExamPercent {
  examId: string
  percent: number
}

/**
 * 'weighted_percentage' strategy: each member exam's own overall percent
 * (already evaluated with that exam's own grading scheme/subjects) is scaled
 * by its resolved weight and summed — a heavier-weighted term counts for
 * more of the combined result, rather than every mark counting equally as
 * 'sum' does.
 */
export function combineByWeightedPercent(percents: ExamPercent[], weights: Map<string, number>): number {
  const total = percents.reduce((s, p) => s + (p.percent * (weights.get(p.examId) ?? 0)) / 100, 0)
  return Math.round(total * 100) / 100
}

/**
 * Resolves a combined percent (from combineByWeightedPercent, which has no
 * per-subject breakdown to feed evaluateOverallResult) into a pass/fail +
 * label/GPA verdict against the combination's own grading scheme — mirrors
 * evaluateOverallResult's non-grade_point / grade_point split, but for a bare
 * aggregate percent rather than a SubjectResult[].
 */
export function evaluateCombinedPercent(percent: number, scheme: GradingScheme): OverallResult {
  const passed = percent >= scheme.passMarkPercent
  if (scheme.schemeType === 'numeric') {
    return { passed, percent, gpa: null, label: null }
  }
  if (!passed) {
    return { passed: false, percent, gpa: scheme.schemeType === 'grade_point' ? 0 : null, label: 'F' }
  }
  const band = resolveGradeBand(scheme.bands, percent)
  return {
    passed: true,
    percent,
    gpa: scheme.schemeType === 'grade_point' ? (band?.gradePoint ?? null) : null,
    label: band?.label ?? null,
  }
}

export type RankBasis = 'grade' | 'mark'

export interface RankableResult {
  studentId: string
  passed: boolean
  gpa: number | null
  percent: number
}

export interface RankedResult extends RankableResult {
  position: number | null
}

function rankKey(r: RankableResult, basis: RankBasis): number {
  return basis === 'grade' ? (r.gpa ?? r.percent) : r.percent
}

/**
 * Auto-position/merit ranking (PRD §5.5), by grade or mark basis. Only passed
 * students are ranked (a failed student gets position null — the mockup
 * shows a Fail badge, not a merit number, in that slot). Standard "1224"
 * competition ranking: students tied on the chosen basis share a position,
 * and the next distinct value's position skips ahead by the tied count —
 * ties are broken for *display order* by raw percent (so a GPA tie still
 * lists the higher-mark student first) without granting them different
 * positions.
 */
export function rankResults(results: RankableResult[], basis: RankBasis): RankedResult[] {
  const passed = results.filter((r) => r.passed)
  const failed = results.filter((r) => !r.passed)
  const sorted = [...passed].sort((a, b) => rankKey(b, basis) - rankKey(a, basis) || b.percent - a.percent)

  const ranked: RankedResult[] = []
  let position = 0
  let seen = 0
  let lastKey: number | null = null
  for (const r of sorted) {
    seen += 1
    const key = rankKey(r, basis)
    if (lastKey === null || key !== lastKey) {
      position = seen
      lastKey = key
    }
    ranked.push({ ...r, position })
  }
  return [...ranked, ...failed.map((r) => ({ ...r, position: null }))]
}

// Re-exported for convenience so callers building a marks-entry/promotion
// screen only need to import from one place; kept as a re-export (not a
// redefinition) so subjectPercent stays the single source of truth.
export { subjectPercent }
