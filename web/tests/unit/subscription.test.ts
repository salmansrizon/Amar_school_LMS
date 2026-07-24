import { describe, it, expect } from 'vitest'
import { expiryAfterRedemption, expiryAfterDecrease, subscriptionStatus } from '@/lib/subscription'

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
