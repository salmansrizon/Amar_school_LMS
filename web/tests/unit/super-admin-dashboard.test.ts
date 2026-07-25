import { describe, it, expect } from 'vitest'
import { lifecycleStatus, summarizeSchools, type SchoolRow } from '@/lib/super-admin/dashboard'

const TODAY = new Date('2026-07-25T00:00:00Z')

function row(over: Partial<SchoolRow>): SchoolRow {
  return {
    id: over.id ?? crypto.randomUUID(),
    name: over.name ?? 'School',
    subscription_expires_at: over.subscription_expires_at ?? null,
    deactivated_at: over.deactivated_at ?? null,
    hasCodeHistory: over.hasCodeHistory ?? false,
  }
}

describe('lifecycleStatus', () => {
  it('deactivated → blocked, regardless of a healthy subscription', () => {
    expect(
      lifecycleStatus(
        row({ deactivated_at: '2026-07-01T00:00:00Z', hasCodeHistory: true, subscription_expires_at: '2027-01-01' }),
        TODAY,
      ),
    ).toBe('blocked')
  })
  it('paid + future expiry → active', () => {
    expect(lifecycleStatus(row({ hasCodeHistory: true, subscription_expires_at: '2026-08-01' }), TODAY)).toBe('active')
  })
  it('paid + lapsed expiry → expired', () => {
    expect(lifecycleStatus(row({ hasCodeHistory: true, subscription_expires_at: '2026-07-01' }), TODAY)).toBe('expired')
  })
  it('no history, no expiry → open-ended trial', () => {
    expect(lifecycleStatus(row({}), TODAY)).toBe('trial')
  })
})

describe('summarizeSchools', () => {
  it('counts each lifecycle bucket', () => {
    const k = summarizeSchools(
      [
        row({ deactivated_at: '2026-01-01T00:00:00Z' }),
        row({ hasCodeHistory: true, subscription_expires_at: '2026-12-01' }),
        row({ hasCodeHistory: true, subscription_expires_at: '2026-01-01' }),
        row({ subscription_expires_at: '2026-12-01' }),
      ],
      TODAY,
    )
    expect(k).toMatchObject({ total: 4, blocked: 1, active: 1, expired: 1, trial: 1 })
  })

  it('soon-expiring: within 7 days, today inclusive, soonest first', () => {
    const k = summarizeSchools(
      [
        row({ id: 'a', name: 'A', hasCodeHistory: true, subscription_expires_at: '2026-07-30' }), // 5 days
        row({ id: 'b', name: 'B', hasCodeHistory: true, subscription_expires_at: '2026-07-26' }), // 1 day
        row({ id: 'c', name: 'C', hasCodeHistory: true, subscription_expires_at: '2026-08-20' }), // far off
        row({ id: 'd', name: 'D', hasCodeHistory: true, subscription_expires_at: '2026-07-20' }), // expired
      ],
      TODAY,
    )
    expect(k.soonExpiring.map((s) => s.id)).toEqual(['b', 'a'])
    expect(k.soonExpiring[0].daysLeft).toBe(1)
  })

  it('expiring today is soon-expiring; a blocked school never is', () => {
    const k = summarizeSchools(
      [
        row({ id: 'today', name: 'T', hasCodeHistory: true, subscription_expires_at: '2026-07-25' }),
        row({ id: 'blk', name: 'B', deactivated_at: '2026-01-01T00:00:00Z', subscription_expires_at: '2026-07-26' }),
      ],
      TODAY,
    )
    expect(k.soonExpiring.map((s) => s.id)).toEqual(['today'])
  })
})
