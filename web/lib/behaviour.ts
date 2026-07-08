// Mirrors the SQL 3-day lock (migration 0011) for UI display; the trigger is
// the authority.
const LOCK_MS = 3 * 24 * 60 * 60 * 1000

/** Locked once 72h have passed since CREATION — never the incident date. */
export function isEntryLocked(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() >= LOCK_MS
}

/** Rolling average across a student's entries, one decimal. */
export function averageRating(ratings: number[]): number | null {
  if (ratings.length === 0) return null
  return Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
}
