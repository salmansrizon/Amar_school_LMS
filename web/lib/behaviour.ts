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

export type RatingBand = 'excellent' | 'good' | 'needsImprovement'

/** Buckets a free-form 0-10 behaviour rating (issue #7's scale) into the
 * 3-band label the progress report's "Behaviour Rating" section displays
 * (issue #33, PRD §5.5) — reuses the existing rating rather than inventing a
 * separate per-criteria rating model behaviour_log_entries doesn't have. */
export function ratingBand(rating: number): RatingBand {
  if (rating >= 8) return 'excellent'
  if (rating >= 5) return 'good'
  return 'needsImprovement'
}
