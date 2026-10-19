import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recordFeeAmount, advanceAmount, settleFee } from '@/lib/fees'
import { feeSelect } from '@/lib/fee-columns'

const rec = (pay: number, fine: number, adjust: number, due: number, fee?: number | null) => ({
  pay_amount: pay,
  fine_amount: fine,
  adjust_amount: adjust,
  due_amount: due,
  fee_amount: fee,
})

describe('recordFeeAmount (#678)', () => {
  it('uses the stored fee when the record has one', () => {
    expect(recordFeeAmount(rec(900, 0, 0, 0, 500))).toEqual({ fee: 500, exact: true })
  })

  it('a stored fee of 0 is a fee of 0, not "missing"', () => {
    expect(recordFeeAmount(rec(0, 0, 0, 0, 0))).toEqual({ fee: 0, exact: true })
  })

  it('derives the fee exactly for an older row while something is due', () => {
    // fee 500 + fine 50 − adjust 100 = 450 payable, 250 received, 200 due
    expect(recordFeeAmount(rec(250, 50, 100, 200))).toEqual({ fee: 500, exact: true })
    expect(recordFeeAmount(rec(250, 50, 100, 200, null))).toEqual({ fee: 500, exact: true })
  })

  it('says so when an older row with nothing due can only be reconstructed', () => {
    // ৳900 received with nothing due: a ৳900 fee paid exactly, or ৳500 with a ৳400 advance.
    expect(recordFeeAmount(rec(900, 0, 0, 0))).toEqual({ fee: 900, exact: false })
  })

  it('round-trips what settleFee stored, in poisha', () => {
    const entry = { fee: 1200.1, fine: 0.2, adjust: 0, received: 100 }
    const { due } = settleFee(entry)
    expect(recordFeeAmount(rec(entry.received, entry.fine, entry.adjust, due)).fee).toBe(1200.1)
  })
})

describe('advanceAmount (#695)', () => {
  it('is what was received beyond fee + fine − adjustment', () => {
    expect(advanceAmount(rec(900, 0, 0, 0, 500))).toBe(400)
    expect(advanceAmount(rec(900, 50, 100, 0, 500))).toBe(450)
  })

  it('is 0 for an exact or a short payment', () => {
    expect(advanceAmount(rec(500, 0, 0, 0, 500))).toBe(0)
    expect(advanceAmount(rec(300, 0, 0, 200, 500))).toBe(0)
  })

  it('is not guessed when the fee was never stored', () => {
    expect(advanceAmount(rec(900, 0, 0, 0))).toBe(0)
    expect(advanceAmount(rec(900, 0, 0, 0, null))).toBe(0)
  })

  it('has no float noise', () => {
    expect(advanceAmount(rec(0.3, 0, 0, 0, 0.1))).toBe(0.2)
  })

  it('counts everything received as advance when the adjustment covers the whole bill', () => {
    expect(advanceAmount(rec(50, 0, 800, 0, 500))).toBe(50)
  })
})

describe('feeSelect', () => {
  it('names only the optional columns the database has', () => {
    expect(feeSelect('id, pay_amount', { feeAmount: false, void: false })).toBe('id, pay_amount')
    expect(feeSelect('id', { feeAmount: true, void: false })).toBe('id, fee_amount')
    expect(feeSelect('id', { feeAmount: false, void: true })).toBe('id, void_at')
    expect(feeSelect('id', { feeAmount: true, void: true }, 'void_at, void_reason')).toBe(
      'id, fee_amount, void_at, void_reason',
    )
  })
})

describe('migration 0230', () => {
  const sql = readFileSync(join(__dirname, '../../supabase/migrations/0230_fee_collection_fee_amount.sql'), 'utf8')
  const statements = sql.replace(/^\s*--.*$/gm, '')

  it('adds a nullable column and rewrites no row', () => {
    expect(statements).toMatch(/add column if not exists fee_amount numeric\(12, 2\) check \(fee_amount >= 0\)/)
    expect(statements).not.toMatch(/\b(update|delete|insert)\b/i)
    expect(statements).not.toMatch(/not null/i)
  })

  it('keeps the fee out of the student view (ADR 0015)', () => {
    expect(statements).not.toMatch(/student_fee_record/)
  })
})
