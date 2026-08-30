// Central Postgres-error → user message map (#284 arch pass). Config-CRUD server
// actions call this instead of returning raw `error.message`, so DB/constraint
// internals never leak to the client and copy is consistent. Pass `overrides` to
// supply per-constraint wording (keyed by SQLSTATE code).
const DEFAULTS: Record<string, string> = {
  '23505': 'That already exists.',
  '23503': 'Still referenced elsewhere — remove that first.',
  '23514': 'A value is out of the allowed range.',
  '23502': 'A required field is missing.',
}

export function pgErrorMessage(
  err: { code?: string | null; message: string },
  overrides?: Record<string, string>,
): string {
  const code = err.code ?? ''
  return overrides?.[code] ?? DEFAULTS[code] ?? 'Something went wrong. Please try again.'
}

/** Friendly text for one specific unique-constraint violation, keyed by the
 *  constraint's own name rather than just its 23505 code — needed whenever a
 *  single write can violate more than one unique constraint on the same
 *  table (e.g. students: both students_roll_unique and
 *  students_rfid_card_number_key can 23505 from the same admitStudent/
 *  updateStudent call), so pgErrorMessage's code-only keying can't tell them
 *  apart — it would apply one `overrides['23505']` string to either. Matches
 *  Postgres's own quoted constraint name (its duplicate-key message is
 *  literally `violates unique constraint "the_name"`) rather than a bare
 *  substring — an unanchored match could false-positive on a future
 *  constraint whose name happens to contain this one (e.g. a `_key_v2` swap
 *  during a migration), silently misreporting an unrelated violation as this
 *  one. Anything else — a different constraint, a different code — passes
 *  through unchanged. */
export function pgConstraintMessage(
  err: { code?: string | null; message: string },
  constraint: string,
  friendly: string,
): string {
  if (err.code === '23505' && err.message.includes(`"${constraint}"`)) return friendly
  return err.message
}
