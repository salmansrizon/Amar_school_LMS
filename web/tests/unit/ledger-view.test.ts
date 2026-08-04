import { describe, it, expect } from 'vitest'
import { trialBalance, accruedByDistributor } from '@/lib/super-admin/ledger-view'

describe('trialBalance', () => {
  it('folds lines into per-account totals and grand totals', () => {
    const tb = trialBalance([
      { account_code: 'cash', debit: 1000, credit: 0 },
      { account_code: 'cash', debit: 500, credit: 0 },
      { account_code: 'income', debit: 0, credit: 1500 },
    ])
    expect(tb.perAccount.get('cash')).toEqual({ debit: 1500, credit: 0 })
    expect(tb.perAccount.get('income')).toEqual({ debit: 0, credit: 1500 })
    expect(tb.totalDebit).toBe(1500)
    expect(tb.totalCredit).toBe(1500)
    expect(tb.balanced).toBe(true)
  })

  it('flags an unbalanced ledger', () => {
    const tb = trialBalance([{ account_code: 'cash', debit: 1000, credit: 0 }])
    expect(tb.balanced).toBe(false)
  })

  it('is empty-safe', () => {
    const tb = trialBalance([])
    expect(tb.totalDebit).toBe(0)
    expect(tb.balanced).toBe(true)
  })
})

describe('accruedByDistributor', () => {
  it('sums only accrued commission per distributor', () => {
    const m = accruedByDistributor([
      { distributor_id: 'a', commission_amount: 100, status: 'accrued' },
      { distributor_id: 'a', commission_amount: 250, status: 'accrued' },
      { distributor_id: 'a', commission_amount: 999, status: 'settled' },
      { distributor_id: 'b', commission_amount: 50, status: 'accrued' },
    ])
    expect(m.get('a')).toBe(350)
    expect(m.get('b')).toBe(50)
  })
})
