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
