import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { capitalSummary, capitalRunningBalances } from '@/lib/director-capital'

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

describe('capitalRunningBalances (#681)', () => {
  it('runs from the opening balance and ends on the closing balance', () => {
    const txns = [invest(1000), withdraw(300), invest(50)]
    const s = capitalSummary(5750, txns) // 5,000 the transactions do not explain
    const running = capitalRunningBalances(s.opening, txns)
    expect(running).toEqual([6000, 5700, 5750])
    expect(running.at(-1)).toBe(s.closing)
  })

  it('ends on the closing balance of a date range too', () => {
    const inRange = [invest(200), withdraw(50)]
    const s = capitalSummary(5000, inRange, [...inRange, invest(1000), withdraw(400)])
    expect(capitalRunningBalances(s.opening, inRange).at(-1)).toBe(s.closing)
  })

  it('has no float drift across decimal amounts', () => {
    expect(capitalRunningBalances(0, [invest(0.1), invest(0.2), withdraw(0.3)])).toEqual([0.1, 0.3, 0])
  })

  it('is empty for no transactions', () => {
    expect(capitalRunningBalances(900, [])).toEqual([])
  })
})

describe('migration 0232', () => {
  const sql = readFileSync(join(__dirname, '../../supabase/migrations/0232_director_capital_guard.sql'), 'utf8')
  const statements = sql.replace(/^\s*--.*$/gm, '')

  it('changes no balance and no transaction when applied', () => {
    // The only UPDATE is inside the trigger function body (the reversal of a deleted row).
    const outside = statements.replace(/\$\$[\s\S]*?\$\$/g, '')
    // (`before update or delete on` is the trigger's event list, not a statement.)
    expect(outside).not.toMatch(/\b(update\s+(public\.)?\w+\s+set|delete\s+from|insert\s+into)\b/i)
    expect(outside).toContain('before update or delete on public.director_capital_transactions')
  })

  it('reverses with the opposite signs of the 0098 posting', () => {
    const m0098 = readFileSync(join(__dirname, '../../supabase/migrations/0098_accounting_ii_gl.sql'), 'utf8')
    expect(m0098).toContain("public.gl_line('1000', -d * sign), public.gl_line('3000', d * sign)")
    expect(statements).toContain("gl_line('1000', poisha), gl_line('3000', -poisha)")
    expect(statements).toContain("case when old.txn_type = 'invest' then old.amount else -old.amount end")
  })

  it('is a definer with a pinned search_path, closed to callers, ending in a schema reload', () => {
    expect(statements).toMatch(/security definer set search_path = public/)
    expect(statements).toContain('revoke execute on function public.director_capital_guard() from public, anon, authenticated')
    expect(statements.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})
