import { describe, it, expect } from 'vitest'
import {
  buildSchoolsManagerViewModel,
  type SchoolsManagerData,
} from '@/lib/super-admin/schools-read-model'

// The shaping that used to live inline in schools/page.tsx: the uuid-string
// history join, the lifecycle classification (incl. paused), the payment ledger
// + last-paid lookups, owner presence, and claim-code grouping.

const TODAY = new Date('2026-07-15T00:00:00Z')

const data: SchoolsManagerData = {
  schools: [
    { id: 'a', name: 'Alpha', subscription_expires_at: '2026-09-01', subdomain: 'alpha', address_line: null, mobile: '01', email: null, eiin_no: null, deactivated_at: null },
    { id: 'b', name: 'Beta', subscription_expires_at: '2027-01-01', subdomain: null, address_line: null, mobile: null, email: null, eiin_no: null, deactivated_at: '2026-07-01T00:00:00Z' },
    { id: 'c', name: 'Gamma', subscription_expires_at: null, subdomain: null, address_line: null, mobile: null, email: null, eiin_no: null, deactivated_at: null },
  ],
  history: ['a', 'b'],
  owners: [{ school_id: 'a' }],
  claimCodes: [
    { code: 'X1', school_id: 'a', redeemed_at: '2026-01-01T00:00:00Z' },
    { code: 'X2', school_id: 'a', redeemed_at: null },
  ],
  codes: [
    { price: 5000, redeemed_at: '2026-05-01T00:00:00Z', redeemed_school_id: 'a' },
    { price: 6000, redeemed_at: '2026-07-01T00:00:00Z', redeemed_school_id: 'a' },
  ],
  studentCounts: [
    { school_id: 'a', count: 3 },
    { school_id: 'c', count: 1 },
  ],
}

describe('buildSchoolsManagerViewModel', () => {
  const cards = buildSchoolsManagerViewModel(data, TODAY)
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]))

  it('classifies lifecycle status, with deactivated → blocked (paused)', () => {
    expect(byId.a.status).toBe('active') // history + future expiry
    expect(byId.b.status).toBe('blocked') // deactivated wins
    expect(byId.c.status).toBe('trial') // no history, no expiry
  })

  it('carries the payment ledger + last-paid per school', () => {
    expect(byId.a.monthsPaid).toBe(2)
    expect(byId.a.totalPaid).toBe(11000)
    expect(byId.a.lastPaid).toBe(6000) // most recent redemption
    expect(byId.c.monthsPaid).toBe(0)
    expect(byId.c.lastPaid).toBeNull()
  })

  it('counts active students per school', () => {
    expect(byId.a.studentCount).toBe(3)
    expect(byId.b.studentCount).toBe(0)
    expect(byId.c.studentCount).toBe(1)
  })

  it('flags owner presence and groups claim codes', () => {
    expect(byId.a.hasOwner).toBe(true)
    expect(byId.c.hasOwner).toBe(false)
    expect(byId.a.claimCodes).toEqual([
      { code: 'X1', redeemed_at: '2026-01-01T00:00:00Z' },
      { code: 'X2', redeemed_at: null },
    ])
    expect(byId.b.claimCodes).toEqual([])
  })
})
