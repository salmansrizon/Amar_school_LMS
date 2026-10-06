// Migration 0216 adds decision_note / decided_at to student_leaves and
// employee_leaves. Until it is applied, anything naming them errors; callers
// retry without them (same idea as attendance-rate-source.ts).

/** PostgREST schema-cache miss (PGRST204) or Postgres undefined_column (42703). */
export function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === 'PGRST204' || error.code === '42703') return true
  return /column .* does not exist|could not find the .* column/i.test(error.message ?? '')
}

/** Run with the new columns; if they do not exist yet, run the old shape. */
export async function withLeaveColumns<R extends { error: { code?: string; message?: string } | null }>(
  withNew: () => PromiseLike<R>,
  without: () => PromiseLike<R>,
): Promise<R> {
  const res = await withNew()
  return isMissingColumnError(res.error) ? without() : res
}

/** Same number as the CHECK in migration 0216. */
export const DECISION_NOTE_MAX = 500

/** Make the reject reason mandatory by flipping this one constant (UI and action both read it). */
export const REJECT_REASON_REQUIRED = false

/** Trimmed note, or null when empty; clipped to the column's CHECK. */
export function cleanDecisionNote(note: string | null | undefined): string | null {
  return (note ?? '').trim().slice(0, DECISION_NOTE_MAX) || null
}
