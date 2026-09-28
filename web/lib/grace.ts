// Considerable Grace Window resolution (issue #9, redesigned by #671): the
// effective grace for an attendance check is the MAX across every applicable
// configured value — School default, Employee Category, that Category's own
// Prayer & Tiffin Window, and an Ad-Hoc Grace Exemption active for that
// specific date. A more specific value can widen the window, never narrow it.
// Office Time and the individual per-Employee override were retired from
// this level set (ADR 0030) — every remaining level is School-wide or
// Category-wide/date-scoped, none individually assigned per Employee.
// Mirrors public.effective_grace_minutes/reconcile_attendance's grace CTE
// (migration 0208); SQL is the authority.
//
// effectiveGraceWithSource is the single implementation of the rule;
// effectiveGrace is the value-only view of it, so the MAX lives in one place.

export interface GraceInputs {
  global: number | null
  category: number | null
  prayerTiffin: number | null
  adHoc: number | null
}

export function effectiveGrace(inputs: GraceInputs): number {
  return effectiveGraceWithSource(inputs).minutes
}

// Issue #30 (Attendance II): the employee-attendance screen must show which
// level the effective grace came from (ui/school-owner/attendance-employee.html
// annotates each row with "20 min (individual override)" etc.) — the same MAX
// rule, keeping the winning source alongside the value.
export type GraceSource = 'global' | 'category' | 'prayerTiffin' | 'adHoc'

export function effectiveGraceWithSource({
  global,
  category,
  prayerTiffin,
  adHoc,
}: GraceInputs): { minutes: number; source: GraceSource | null } {
  const levels: { source: GraceSource; minutes: number | null | undefined }[] = [
    { source: 'global', minutes: global },
    { source: 'category', minutes: category },
    { source: 'prayerTiffin', minutes: prayerTiffin },
    { source: 'adHoc', minutes: adHoc },
  ]
  const applicable = levels.filter(
    (l): l is { source: GraceSource; minutes: number } => l.minutes !== null && l.minutes !== undefined,
  )
  if (!applicable.length) return { minutes: 0, source: null }

  const minutes = Math.max(...applicable.map((l) => l.minutes))
  // Ties resolve to the most specific level — an Ad-Hoc Grace Exemption is
  // the most deliberate, date-scoped configuration, so it should be the one
  // credited when it ties a standing default rather than an incidental match.
  const priority: GraceSource[] = ['adHoc', 'prayerTiffin', 'category', 'global']
  const source = priority.find((p) => applicable.some((l) => l.source === p && l.minutes === minutes)) ?? null
  return { minutes, source }
}
