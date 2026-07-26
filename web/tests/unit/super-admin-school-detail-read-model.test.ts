import { describe, it, expect } from 'vitest'
import {
  buildSchoolDetailViewModel,
  type SchoolDetailData,
} from '@/lib/super-admin/school-detail-read-model'

const TODAY = new Date('2026-07-15T00:00:00Z')
const ROOT = 'example.com'

function data(over: Partial<SchoolDetailData> = {}): SchoolDetailData {
  return {
    school: {
      id: 'a',
      name: 'Alpha',
      subscription_expires_at: '2026-09-01',
      deactivated_at: null,
      subdomain: 'alpha',
      ...over.school,
    },
    history: over.history ?? ['a'],
    claimCodes: over.claimCodes ?? [],
    flags: over.flags ?? [],
    ledger: over.ledger ?? [],
  }
}

describe('buildSchoolDetailViewModel', () => {
  it('classifies status (paused when deactivated) and reports blocked', () => {
    expect(buildSchoolDetailViewModel(data(), TODAY, ROOT).status).toBe('active')
    const paused = buildSchoolDetailViewModel(
      data({ school: { id: 'a', name: 'Alpha', subscription_expires_at: '2027-01-01', deactivated_at: '2026-07-01T00:00:00Z', subdomain: null } }),
      TODAY,
      ROOT,
    )
    expect(paused.status).toBe('blocked')
    expect(paused.blocked).toBe(true)
  })

  it('turns only unredeemed claim codes into activation links', () => {
    const vm = buildSchoolDetailViewModel(
      data({
        claimCodes: [
          { code: 'OPEN1', redeemed_at: null },
          { code: 'USED1', redeemed_at: '2026-01-01T00:00:00Z' },
        ],
      }),
      TODAY,
      ROOT,
    )
    expect(vm.activationLinks.map((l) => l.code)).toEqual(['OPEN1'])
    expect(vm.activationLinks[0].url).toContain('OPEN1')
  })

  it('maps enabled flag keys and passes the ledger through', () => {
    const ledger = [{ delta: 5000, reason: 'topup' as const, amount: 500, note: null, created_at: '2026-07-01T00:00:00Z' }]
    const vm = buildSchoolDetailViewModel(data({ flags: [{ flag_key: 'sms' }, { flag_key: 'sms_metering' }], ledger }), TODAY, ROOT)
    expect(vm.enabledFlags).toEqual(['sms', 'sms_metering'])
    expect(vm.ledger).toBe(ledger)
  })
})
