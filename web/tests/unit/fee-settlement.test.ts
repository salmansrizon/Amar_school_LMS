import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  billedFeeAmount,
  feeGlRefPattern,
  feePeriodFromParams,
  feePeriodLabel,
  advanceAmount,
  overpaidAmount,
  receiptTotal,
  settleFee,
  FEE_GL_ORDER_COLUMN,
} from '@/lib/fees'

// Owner workflow audit 2026-10-03 (finance): the receipt denied a ledger entry
// that existed, overpayment went through unremarked, a reopened partial record
// showed fee 0 / due 0, and the dues links lost their month.

describe('settleFee', () => {
  it('a partial payment leaves the shortfall due and is not overpaid', () => {
    expect(settleFee({ fee: 500, fine: 0, adjust: 0, received: 300 })).toEqual({ total: 500, due: 200, overpaid: 0 })
  })

  it('an exact payment owes nothing and is not overpaid', () => {
    expect(settleFee({ fee: 500, fine: 50, adjust: 0, received: 550 })).toEqual({ total: 550, due: 0, overpaid: 0 })
  })

  it('flags the audited case: ৳900 received on a ৳500 fee is ৳400 over', () => {
    expect(settleFee({ fee: 500, fine: 0, adjust: 0, received: 900 })).toEqual({ total: 500, due: 0, overpaid: 400 })
  })

  it('counts the fine and the discount before deciding what is over', () => {
    expect(settleFee({ fee: 500, fine: 100, adjust: 200, received: 450 }).overpaid).toBe(50)
  })

  it('treats money received against no fee at all as overpaid', () => {
    expect(settleFee({ fee: 0, fine: 0, adjust: 0, received: 500 }).overpaid).toBe(500)
  })
})

describe('overpaidAmount', () => {
  it('ignores float noise — 0.1 + 0.2 received on 0.3 is not an overpayment', () => {
    expect(overpaidAmount(0.3, 0.1 + 0.2)).toBe(0)
  })

  it('keeps poisha precision', () => {
    expect(overpaidAmount(500, 500.5)).toBe(0.5)
  })
})

describe('billedFeeAmount', () => {
  it('recovers the fee of a partial record (the audited ৳300 of ৳500)', () => {
    expect(billedFeeAmount({ pay_amount: 300, fine_amount: 0, adjust_amount: 0, due_amount: 200 })).toBe(500)
  })

  it('takes the fine back out and puts the discount back in', () => {
    // fee 500 + fine 50 − adjust 100 = 450 payable; 200 received, 250 due.
    expect(billedFeeAmount({ pay_amount: 200, fine_amount: 50, adjust_amount: 100, due_amount: 250 })).toBe(500)
  })

  it('reopening a record reproduces its stored due', () => {
    const record = { pay_amount: 300, fine_amount: 50, adjust_amount: 20, due_amount: 230 }
    const again = settleFee({
      fee: billedFeeAmount(record),
      fine: record.fine_amount,
      adjust: record.adjust_amount,
      received: record.pay_amount,
    })
    expect(again.due).toBe(record.due_amount)
    expect(again.overpaid).toBe(0)
  })

  it('a settled record reopens with nothing due and nothing over', () => {
    const record = { pay_amount: 500, fine_amount: 0, adjust_amount: 0, due_amount: 0 }
    expect(billedFeeAmount(record)).toBe(500)
  })

  it('never goes negative', () => {
    expect(billedFeeAmount({ pay_amount: 0, fine_amount: 100, adjust_amount: 0, due_amount: 0 })).toBe(0)
  })
})

// #707, owner's decision: the received amount INCLUDES the fine.
describe('receipt total (#707)', () => {
  const saved = (received: number) => {
    const { due } = settleFee({ fee: 100, fine: 10, adjust: 0, received })
    return { fee_amount: 100, fine_amount: 10, adjust_amount: 0, pay_amount: received, due_amount: due }
  }

  it('fee 100, fine 10, received 60: total received 60, 50 still due', () => {
    const record = saved(60)
    expect(receiptTotal(record)).toBe(60)
    expect(record.due_amount).toBe(50)
    expect(advanceAmount(record)).toBe(0)
  })

  it('fee 100, fine 10, received 110: 110 was paid in all, nothing due', () => {
    const record = saved(110)
    expect(receiptTotal(record)).toBe(110)
    expect(record.due_amount).toBe(0)
    expect(advanceAmount(record)).toBe(0)
  })

  it('fee 100, fine 10, received 130: total received 130, advance 20', () => {
    const record = saved(130)
    expect(receiptTotal(record)).toBe(130)
    expect(record.due_amount).toBe(0)
    expect(advanceAmount(record)).toBe(20)
  })

  it('the receipt page takes its total and its amount in words from receiptTotal', () => {
    const page = readFileSync(join(__dirname, '../../app/school/fees/receipt/[id]/page.tsx'), 'utf8')
    expect(page).toContain('const total = receiptTotal(')
    expect(page).not.toContain('totalPayable(')
    expect(page).toContain('takaInWords(total)')
  })
})

describe('fee record ledger lookup', () => {
  const id = '2c0841f9-d8ff-4695-aa7a-22ff1b298c40'
  // SQL LIKE with a single trailing % is a prefix match.
  const matches = (ref: string, pattern: string) => pattern.endsWith('%') && ref.startsWith(pattern.slice(0, -1))

  it('matches every posting the fee_gl_post trigger writes for the record', () => {
    expect(matches(`fee:${id}:1`, feeGlRefPattern(id))).toBe(true)
    expect(matches(`fee:${id}:48213`, feeGlRefPattern(id))).toBe(true)
  })

  it('does not match another record or another posting source', () => {
    expect(matches('fee:2c0841f9-d8ff-4695-aa7a-22ff1b298c41:1', feeGlRefPattern(id))).toBe(false)
    expect(matches(`voucher:${id}:1`, feeGlRefPattern(id))).toBe(false)
  })

  it('builds the ref the way migration 0097 does', () => {
    const sql = readFileSync(join(__dirname, '../../supabase/migrations/0097_fee_gl_review_fixes.sql'), 'utf8')
    expect(sql).toContain("'fee:' || p_id || ':' || nextval('public.fee_gl_seq')")
  })

  it('orders by a column gl_entries really has — the cause of the false "no ledger entry"', () => {
    const sql = readFileSync(join(__dirname, '../../supabase/migrations/0085_general_ledger.sql'), 'utf8')
    const table = sql.slice(sql.indexOf('create table public.gl_entries'), sql.indexOf('create table public.gl_lines'))
    expect(table).toMatch(new RegExp(`\\b${FEE_GL_ORDER_COLUMN}\\b`))
    expect(table).not.toMatch(/\bcreated_at\b/)
  })
})

describe('feePeriodFromParams', () => {
  const today = { month: 10, year: 2026 }

  it('uses the month and year a dues link carries', () => {
    expect(feePeriodFromParams('7', '2026', today)).toEqual({ month: 7, year: 2026 })
  })

  it('falls back to today when they are absent', () => {
    expect(feePeriodFromParams(undefined, undefined, today)).toEqual(today)
  })

  it('falls back per field for a month or year that cannot exist', () => {
    expect(feePeriodFromParams('13', '2025', today)).toEqual({ month: 10, year: 2025 })
    expect(feePeriodFromParams('0', 'abc', today)).toEqual(today)
    expect(feePeriodFromParams('7.5', '99999', today)).toEqual(today)
  })
})

describe('feePeriodLabel', () => {
  it('writes both halves in Bangla digits, the year ungrouped', () => {
    expect(feePeriodLabel(7, 2026, 'bn-BD')).toBe('৭/২০২৬')
  })

  it('writes both halves in Latin digits for English', () => {
    expect(feePeriodLabel(7, 2026, 'en-GB')).toBe('7/2026')
  })
})
