import { describe, it, expect } from 'vitest'
import { distributorKpis } from '@/lib/super-admin/distributor-view'

describe('distributorKpis', () => {
  it('totals all commissions and the accrued-only pending slice', () => {
    const k = distributorKpis([
      { commission_amount: 5000, status: 'accrued' },
      { commission_amount: 3000, status: 'settled' },
      { commission_amount: 2000, status: 'accrued' },
    ])
    expect(k.commissionTotal).toBe(10000)
    expect(k.pendingSettlement).toBe(7000) // accrued only
  })

  it('is zero with no commissions', () => {
    expect(distributorKpis([])).toEqual({ commissionTotal: 0, pendingSettlement: 0 })
  })
})
