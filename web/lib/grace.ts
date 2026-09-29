// Considerable Grace Window resolution (issue #9, redesigned by #671 and
// #673): the effective grace for an attendance check is the MAX across every
// Standing Grace Rule covering the Employee's Category, plus an Ad-Hoc Grace
// Exemption active for that specific date. A rule's Shift plays no part
// (ADR 0032) — it only organises the Grace Time screen. The School default,
// per-Category grace and Prayer & Tiffin Window levels were retired (#673).
// Mirrors public.effective_grace_minutes/reconcile_attendance's grace CTE
// (migration 0210); SQL is the authority.
//
// effectiveGraceWithSource is the single implementation of the rule;
// effectiveGrace is the value-only view of it, so the MAX lives in one place.

/** Fixed, code-owned Grace Detail list (issue #673) — the reason a Standing
 *  Grace Rule carries. Identical for every School; not free text. */
export const GRACE_DETAILS = [
  'General',
  'Lunch Hour',
  'Tiffin',
  'Prayer',
  'Prayer & Tiffin',
  "Jumu'ah",
  'Transport Delay',
  'Weather',
  'Special Duty',
  'Meeting',
] as const

export type GraceDetail = (typeof GRACE_DETAILS)[number]

export const GRACE_DETAIL_LABEL_KEY = Object.fromEntries(
  GRACE_DETAILS.map((d) => [d, `graceDetail.${d}`]),
) as Record<GraceDetail, `graceDetail.${GraceDetail}`>

export function isGraceDetail(value: string): value is GraceDetail {
  return (GRACE_DETAILS as readonly string[]).includes(value)
}

export interface StandingGraceCandidate {
  detail: string
  minutes: number
}

export interface GraceInputs {
  /** Every Standing Grace Rule covering the Employee's Category, any Shift. */
  standing: readonly StandingGraceCandidate[]
  adHoc: number | null
}

export type GraceSource = { kind: 'standing'; detail: string } | { kind: 'adHoc' }

export function effectiveGrace(inputs: GraceInputs): number {
  return effectiveGraceWithSource(inputs).minutes
}

// Issue #30 (Attendance II): the employee-attendance screen shows which rule
// the effective grace came from — the same MAX rule, keeping the winning
// source alongside the value.
export function effectiveGraceWithSource({ standing, adHoc }: GraceInputs): {
  minutes: number
  source: GraceSource | null
} {
  const candidates: { source: GraceSource; minutes: number }[] = []
  // Ties resolve to an Ad-Hoc Grace Exemption first — the most deliberate,
  // date-scoped configuration — then to Grace Detail list order, so the
  // credited reason is deterministic regardless of query row order.
  if (adHoc !== null) candidates.push({ source: { kind: 'adHoc' }, minutes: adHoc })
  const ordered = [...standing].sort(
    (a, b) => detailRank(a.detail) - detailRank(b.detail),
  )
  for (const r of ordered) candidates.push({ source: { kind: 'standing', detail: r.detail }, minutes: r.minutes })

  if (!candidates.length) return { minutes: 0, source: null }
  const minutes = Math.max(...candidates.map((c) => c.minutes))
  return { minutes, source: candidates.find((c) => c.minutes === minutes)!.source }
}

function detailRank(detail: string): number {
  const i = (GRACE_DETAILS as readonly string[]).indexOf(detail)
  return i === -1 ? GRACE_DETAILS.length : i
}
