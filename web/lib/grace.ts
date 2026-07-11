// Considerable Grace Window resolution (issue #9): the effective grace for an
// attendance check is the MAX across every applicable configured value —
// global default, category default, each assigned shift, and the
// per-individual override. An override can widen the window, never narrow it.
// Mirrors public.effective_grace_minutes (migration 0012); SQL is the authority.

export interface GraceInputs {
  global: number | null
  category: number | null
  shifts: number[]
  override: number | null
}

export function effectiveGrace({ global, category, shifts, override }: GraceInputs): number {
  const applicable = [global, category, ...shifts, override].filter(
    (v): v is number => v !== null && v !== undefined,
  )
  return applicable.length ? Math.max(...applicable) : 0
}

// Issue #30 (Attendance II): the employee-attendance screen must show which
// level the effective grace came from (ui/school-owner/attendance-employee.html
// annotates each row with "20 min (individual override)" etc.) — same MAX
// rule as effectiveGrace, but keeping the winning source alongside the value.
export type GraceSource = 'global' | 'category' | 'shift' | 'override'

export function effectiveGraceWithSource({
  global,
  category,
  shifts,
  override,
}: GraceInputs): { minutes: number; source: GraceSource | null } {
  const shiftMax = shifts.length ? Math.max(...shifts) : null
  const levels: { source: GraceSource; minutes: number | null | undefined }[] = [
    { source: 'global', minutes: global },
    { source: 'category', minutes: category },
    { source: 'shift', minutes: shiftMax },
    { source: 'override', minutes: override },
  ]
  const applicable = levels.filter(
    (l): l is { source: GraceSource; minutes: number } => l.minutes !== null && l.minutes !== undefined,
  )
  if (!applicable.length) return { minutes: 0, source: null }

  const minutes = Math.max(...applicable.map((l) => l.minutes))
  // Ties resolve to the most specific level — an override is the most
  // deliberate configuration, so it should be the one credited when it ties
  // the school/category/shift default rather than an incidental match.
  const priority: GraceSource[] = ['override', 'shift', 'category', 'global']
  const source = priority.find((p) => applicable.some((l) => l.source === p && l.minutes === minutes)) ?? null
  return { minutes, source }
}
