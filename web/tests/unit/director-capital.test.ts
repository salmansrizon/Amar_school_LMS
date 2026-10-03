import { describe, it, expect } from 'vitest'
import { capitalSummary } from '@/lib/director-capital'

const invest = (amount: number) => ({ txn_type: 'invest', amount })
const withdraw = (amount: number) => ({ txn_type: 'withdraw', amount })

describe('capitalSummary (#681)', () => {
  it('a consistent account opens at zero and closes at the stored balance', () => {
    const txns = [invest(1000), withdraw(300), invest(50)]
    expect(capitalSummary(750, txns)).toEqual({ opening: 0, invested: 1050, withdrawn: 300, closing: 750 })
  })

  it('surfaces a balance the listed transactions cannot explain as the opening balance', () => {
    // The audit's figures: ৳1,395,000 stored, 162 × ৳500 invested, nothing withdrawn.
    const s = capitalSummary(1_395_000, Array.from({ length: 162 }, () => invest(500)))
    expect(s).toEqual({ opening: 1_314_000, invested: 81_000, withdrawn: 0, closing: 1_395_000 })
  })

  it('always satisfies opening + invested − withdrawn = closing', () => {
    const inRange = [invest(200), withdraw(50)]
    const sinceFrom = [...inRange, invest(1000), withdraw(400)] // two more after the range's end
    const s = capitalSummary(5000, inRange, sinceFrom)
    expect(s.opening).toBe(4250)
    expect(s.closing).toBe(4400)
    expect(s.opening + s.invested - s.withdrawn).toBe(s.closing)
  })

  it('an empty range opens and closes at the same figure', () => {
    expect(capitalSummary(900, [], [invest(100)])).toEqual({ opening: 800, invested: 0, withdrawn: 0, closing: 800 })
    expect(capitalSummary(0, [])).toEqual({ opening: 0, invested: 0, withdrawn: 0, closing: 0 })
  })
})
