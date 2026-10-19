// Client-side mirror of the SQL subscription rules (redeem_code /
// decrease_expiry in migration 0008) — used for UI previews only; the
// database is the authority.

import { schoolToday } from './school-time'

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

/** Whole calendar days left until `expiresAt` (YYYY-MM-DD), counted in the
 *  School's own calendar day — Asia/Dhaka, via school-time.ts — not the
 *  server's UTC clock: 0 = expires today, negative once lapsed. `now` is the
 *  caller's clock (the dashboard's request-time `Date`), kept as a parameter
 *  so this stays pure and unit-testable. */
export function daysLeft(expiresAt: string, now: Date): number {
  return daysUntil(new Date(schoolToday(now) + 'T00:00:00Z'), new Date(expiresAt + 'T00:00:00Z'))
}

/** How many days before expiry the school-side reminder banner appears (#169). */
export const REMINDER_WINDOW_DAYS = 7

/** True from 7 days left (inclusive) through already-expired — the dashboard
 *  subscription card's danger window, sharing the reminder banner's threshold. */
export function isDaysLeftDanger(days: number): boolean {
  return days <= REMINDER_WINDOW_DAYS
}

export type CountdownKind = 'left' | 'today' | 'expired'

/** Which branch of the dashboard countdown phrase applies for a `daysLeft`
 *  result: still counting down, expires today, or already lapsed. Split out
 *  from the phrase text itself (i18n + Bangla-digit formatting, done by the
 *  caller) so the boundary — 0 is "today", not "expired" or "1 left" — is
 *  independently unit-tested. */
export function countdownKind(days: number): CountdownKind {
  if (days > 0) return 'left'
  if (days === 0) return 'today'
  return 'expired'
}

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
