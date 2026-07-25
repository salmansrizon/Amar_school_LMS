import { describe, it, expect } from 'vitest'
import {
  expiryAfterRedemption,
  expiryAfterDecrease,
  subscriptionStatus,
  daysUntilExpiry,
  startOfUtcToday,
  shouldShowReminder,
} from '@/lib/subscription'

// Mirrors the SQL rules in redeem_code / decrease_expiry (issues #5, #6).
const TODAY = new Date('2026-07-08')

describe('expiryAfterRedemption: stacks onto max(today, current expiry)', () => {
  it('active school: extends from the existing future expiry', () => {
    expect(expiryAfterRedemption(new Date('2026-09-15'), 3, TODAY)).toEqual(new Date('2026-12-15'))
  })

  it('lapsed school: starts fresh from today, not the stale expiry', () => {
    expect(expiryAfterRedemption(new Date('2025-01-10'), 12, TODAY)).toEqual(new Date('2027-07-08'))
  })

  it('trial school (no expiry at all): starts from today', () => {
    expect(expiryAfterRedemption(null, 1, TODAY)).toEqual(new Date('2026-08-08'))
  })

  it('expiring today counts as active-through-today: stacks from today', () => {
    expect(expiryAfterRedemption(new Date('2026-07-08'), 2, TODAY)).toEqual(new Date('2026-09-08'))
  })

  it('clamps month-end overflow like Postgres (Jan 31 + 1mo = Feb 28)', () => {
    expect(expiryAfterRedemption(new Date('2027-01-31'), 1, TODAY)).toEqual(new Date('2027-02-28'))
    expect(expiryAfterRedemption(new Date('2026-08-31'), 1, TODAY)).toEqual(new Date('2026-09-30'))
  })
})

describe('expiryAfterDecrease (issue #6)', () => {
  it('subtracts whole months from the current expiry', () => {
    expect(expiryAfterDecrease(new Date('2026-12-15'), 2)).toEqual(new Date('2026-10-15'))
  })
})

describe('subscriptionStatus', () => {
  it('no code history + no expiry → open-ended trial', () => {
    expect(subscriptionStatus(false, null, TODAY)).toBe('trial')
  })
  it('no code history + future expiry → trial (active demo window)', () => {
    expect(subscriptionStatus(false, new Date('2026-07-20'), TODAY)).toBe('trial')
  })
  it('no code history + expiry today → still trial', () => {
    expect(subscriptionStatus(false, new Date('2026-07-08'), TODAY)).toBe('trial')
  })
  it('no code history + past expiry → expired (trial lapsed)', () => {
    expect(subscriptionStatus(false, new Date('2026-07-07'), TODAY)).toBe('expired')
  })
  it('code history + future expiry → active', () => {
    expect(subscriptionStatus(true, new Date('2026-09-01'), TODAY)).toBe('active')
  })
  it('expiry today → still active', () => {
    expect(subscriptionStatus(true, new Date('2026-07-08'), TODAY)).toBe('active')
  })
  it('code history + past expiry → expired', () => {
    expect(subscriptionStatus(true, new Date('2026-07-07'), TODAY)).toBe('expired')
  })
})

describe('date helpers (#169)', () => {
  it('startOfUtcToday returns a UTC-midnight Date', () => {
    const d = startOfUtcToday()
    expect(d.getUTCHours()).toBe(0)
    expect(d.getUTCMinutes()).toBe(0)
  })
  it('daysUntilExpiry counts whole days ahead and goes negative once lapsed', () => {
    const today = startOfUtcToday().toISOString().slice(0, 10)
    expect(daysUntilExpiry(today)).toBe(0)
    const plus3 = new Date(startOfUtcToday().getTime() + 3 * 86_400_000).toISOString().slice(0, 10)
    expect(daysUntilExpiry(plus3)).toBe(3)
    const minus2 = new Date(startOfUtcToday().getTime() - 2 * 86_400_000).toISOString().slice(0, 10)
    expect(daysUntilExpiry(minus2)).toBe(-2)
  })
})

describe('shouldShowReminder (#169)', () => {
  const soon = new Date(startOfUtcToday().getTime() + 3 * 86_400_000).toISOString().slice(0, 10)
  const far = new Date(startOfUtcToday().getTime() + 30 * 86_400_000).toISOString().slice(0, 10)
  const past = new Date(startOfUtcToday().getTime() - 1 * 86_400_000).toISOString().slice(0, 10)
  it('active/trial within 7 days, not dismissed → show', () => {
    expect(shouldShowReminder('active', soon, undefined)).toBe(true)
    expect(shouldShowReminder('trial', soon, undefined)).toBe(true)
  })
  it('dismissed for this exact expiry → hide', () => {
    expect(shouldShowReminder('active', soon, soon)).toBe(false)
  })
  it('outside the window, expired, or blocked status → hide', () => {
    expect(shouldShowReminder('active', far, undefined)).toBe(false)
    expect(shouldShowReminder('active', past, undefined)).toBe(false)
    expect(shouldShowReminder('expired', soon, undefined)).toBe(false)
    expect(shouldShowReminder('active', null, undefined)).toBe(false)
  })
})
