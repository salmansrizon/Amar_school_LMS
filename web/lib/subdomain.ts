// Shared subdomain-slug rules (map #104 / decision #107). The DB mirrors these
// in a check constraint + the redeem/rename RPCs (migration 0063); this module
// is the single source of truth the UI validates against before a round-trip.

/** Infra hostnames that must never resolve to a tenant. */
const RESERVED_INFRA = [
  'www', 'app', 'admin', 'api', 'auth', 'mail', 'cdn', 'static', 'assets',
  'staging', 'dev', 'preview', 'vercel', 'status', 'help', 'support', 'docs', 'blog',
]

/** Every top-level app route segment — a slug colliding with one would shadow it. */
const RESERVED_ROUTES = [
  'api', 'auth', 'dealer', 'gov', 'login', 'reset-password', 'school', 'signup', 'super-admin',
]

/** Full reserved set (deduped, sorted) — infra hosts + app route segments. */
export const RESERVED_SLUGS: readonly string[] = Array.from(
  new Set([...RESERVED_INFRA, ...RESERVED_ROUTES]),
).sort()

export const SLUG_MIN = 3
export const SLUG_MAX = 63

export type SlugError =
  | 'empty'
  | 'too_short'
  | 'too_long'
  | 'charset'
  | 'hyphen'
  | 'reserved'

/**
 * Validate a subdomain slug. Returns null when valid, else the first failing
 * rule. Callers case-normalize via {@link normalizeSlug} before persisting.
 */
export function validateSlug(input: string): SlugError | null {
  const slug = input.toLowerCase()
  if (slug.length === 0) return 'empty'
  if (slug.length < SLUG_MIN) return 'too_short'
  if (slug.length > SLUG_MAX) return 'too_long'
  // lowercase a-z, 0-9, hyphen only
  if (!/^[a-z0-9-]+$/.test(slug)) return 'charset'
  // no leading/trailing hyphen, no double hyphen
  if (slug.startsWith('-') || slug.endsWith('-') || slug.includes('--')) return 'hyphen'
  if (RESERVED_SLUGS.includes(slug)) return 'reserved'
  return null
}

export function isValidSlug(input: string): boolean {
  return validateSlug(input) === null
}

/** Case-normalized form persisted to `schools.subdomain`. */
export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase()
}
