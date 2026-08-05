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
