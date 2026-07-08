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
