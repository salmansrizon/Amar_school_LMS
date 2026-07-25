// Client-side mirror of the SQL subscription rules (redeem_code /
// decrease_expiry in migration 0008) — used for UI previews only; the
// database is the authority.

function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  const day = result.getUTCDate()
  result.setUTCMonth(result.getUTCMonth() + months)
  // Clamp month-end overflow (Jan 31 + 1mo → Feb 28/29, not Mar 3),
  // matching Postgres make_interval semantics.
  if (result.getUTCDate() !== day) result.setUTCDate(0)
  return result
}

/** Redemption stacks the code's validity onto max(today, current expiry). */
export function expiryAfterRedemption(
  currentExpiry: Date | null,
  validityMonths: number,
  today: Date,
): Date {
  const base = currentExpiry && currentExpiry > today ? currentExpiry : today
  return addMonths(base, validityMonths)
}

/** Manual correction: decrease the (active) expiry by whole months. */
export function expiryAfterDecrease(currentExpiry: Date, months: number): Date {
  return addMonths(currentExpiry, -months)
}

/** Today at UTC-midnight — the reference point for status/expiry comparisons,
 *  matching the `date`-typed subscription_expires_at (compared as UTC dates). */
export function startOfUtcToday(): Date {
  return new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')
}

/** Whole days from `today` to `expiry` (negative once lapsed). */
export function daysUntil(today: Date, expiry: Date): number {
  return Math.round((expiry.getTime() - today.getTime()) / 86_400_000)
}

/** Days until a YYYY-MM-DD expiry from UTC-today; negative once lapsed. */
export function daysUntilExpiry(expiry: string): number {
  return daysUntil(startOfUtcToday(), new Date(expiry + 'T00:00:00Z'))
}

/** How many days before expiry the school-side reminder banner appears (#169). */
export const REMINDER_WINDOW_DAYS = 7

/** Whether the 7-day reminder banner should show: an active/trial school whose
 *  expiry is within the window (today inclusive) and not already dismissed for
 *  that exact expiry date. Pure so the layout gate is unit-testable. */
export function shouldShowReminder(
  status: string | null,
  expiry: string | null,
  dismissedFor: string | undefined,
): boolean {
  if (status !== 'active' && status !== 'trial') return false
  if (!expiry || expiry === dismissedFor) return false
  const daysLeft = daysUntilExpiry(expiry)
  return daysLeft >= 0 && daysLeft <= REMINDER_WINDOW_DAYS
}

export type SubscriptionStatus = 'trial' | 'active' | 'expired'

/**
 * A school with no code history is on a trial (issue #111): time-boxed to its
 * expiry when one is set (demo window), or open-ended when none was ever set
 * (a school that never got a trial must not silently flip to expired). A school
 * with code history is active while its paid expiry holds, else expired.
 */
export function subscriptionStatus(
  hasCodeHistory: boolean,
  expiry: Date | null,
  today: Date,
): SubscriptionStatus {
  if (!hasCodeHistory) {
    if (expiry === null) return 'trial'
    return expiry >= today ? 'trial' : 'expired'
  }
  if (expiry && expiry >= today) return 'active'
  return 'expired'
}
