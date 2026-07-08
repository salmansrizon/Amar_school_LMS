// Client-side mirror of the SQL subscription rules (redeem_code /
// decrease_expiry in migration 0008) — used for UI previews only; the
// database is the authority.

function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  result.setUTCMonth(result.getUTCMonth() + months)
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

/** Trial is defined purely by the absence of code history (CONTEXT.md). */
export function subscriptionStatus(
  hasCodeHistory: boolean,
  expiry: Date | null,
  today: Date,
): SubscriptionStatus {
  if (!hasCodeHistory) return 'trial'
  if (expiry && expiry >= today) return 'active'
  return 'expired'
}
