// Feedback module domain logic (issue #38, PRD §5.9). Pure functions only —
// the DB/RLS layer (migration 0037) is the authority for persistence and
// tenancy; this module is the seam for the two pieces of real business logic:
// the inbox state machine and the ratings-dashboard aggregation math.

export type FeedbackStatus = 'unread' | 'read' | 'answered'

/** Opening a message reads it; already read/answered messages are untouched. */
export function statusOnOpen(current: FeedbackStatus): FeedbackStatus {
  return current === 'unread' ? 'read' : current
}

/** Sending a reply always lands on 'answered', unconditionally — there is no
 * prior state to branch on, unlike statusOnOpen. */
export function statusOnReply(): FeedbackStatus {
  return 'answered'
}

/** Rounds to one decimal place; null when there is nothing to average. */
export function averageRating(ratings: number[]): number | null {
  if (ratings.length === 0) return null
  return Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
}

export interface RatingBucket {
  star: 1 | 2 | 3 | 4 | 5
  count: number
  pct: number
}

/** Star-count/percentage buckets, 5 down to 1 (matches the mockup's layout). */
export function ratingDistribution(ratings: number[]): RatingBucket[] {
  const total = ratings.length
  return ([5, 4, 3, 2, 1] as const).map((star) => {
    const count = ratings.filter((r) => r === star).length
    const pct = total === 0 ? 0 : Math.round((count / total) * 100)
    return { star, count, pct }
  })
}

export const CATEGORY_KEYS = ['teaching', 'facilities', 'communication', 'safety'] as const
export type CategoryKey = (typeof CATEGORY_KEYS)[number]

export type CategoryRatings = Partial<Record<CategoryKey, number | null>>

/** Per-category average, each computed independently over its own non-null ratings. */
export function averageByCategory(
  rows: CategoryRatings[],
): Record<CategoryKey, number | null> {
  const result = {} as Record<CategoryKey, number | null>
  for (const key of CATEGORY_KEYS) {
    const values = rows
      .map((r) => r[key])
      .filter((v): v is number => typeof v === 'number')
    result[key] = averageRating(values)
  }
  return result
}

/** Share of inbox messages that reached 'answered', rounded to a whole percent. */
export function responseRate(total: number, answered: number): number {
  if (total === 0) return 0
  return Math.round((answered / total) * 100)
}
