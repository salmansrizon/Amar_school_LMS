import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// #707, migration 0258. The SQL cannot be run from a unit test (the migration is
// not applied), so this pins the text of the rule and replays it in poisha.

const sql = readFileSync(join(__dirname, '../../supabase/migrations/0258_fee_gl_fine_inside_received.sql'), 'utf8')
const statements = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

describe('migration 0258: the fine is inside the received amount', () => {
  it('has one rule: fine income = least(fine, received), never negative', () => {
    expect(statements).toContain('select greatest(least(round(p_fine * 100), round(p_pay * 100)), 0)::bigint;')
    // Used for both sides of the delta, and nowhere is pay + fine posted.
    expect(statements.match(/public\.fee_gl_fine_part\((new|old)\.pay_amount, (new|old)\.fine_amount\)/g)).toHaveLength(2)
    expect(statements).not.toMatch(/round\((new|old)\.fine_amount \* 100\)/)
  })

  it('posts the delta between two states, so cash moves by the change in pay_amount', () => {
    expect(statements).toContain('(pay_new - fine_new) - (pay_old - fine_old), fine_new - fine_old,')
    expect(statements).toContain("if tg_op = 'UPDATE' then")
  })

  it('skips a zero cash leg: gl_lines refuses a line with neither side (0085)', () => {
    const m0085 = readFileSync(join(__dirname, '../../supabase/migrations/0085_general_ledger.sql'), 'utf8')
    expect(m0085).toContain('(debit > 0 or credit > 0)')
    expect(statements).toContain('if pp + ff <> 0 then lines := lines || public.gl_line(cash_acct, -(pp + ff)); end if;')
  })

  it('void and delete reverse what the ledger holds, not a figure worked out from the row', () => {
    const voidFn = statements.slice(statements.indexOf('function public.fee_post_gl_void()'))
    expect(voidFn.match(/perform public\.fee_gl_reverse\(/g)).toHaveLength(2)
    expect(voidFn).not.toContain('fee_gl_apply')
    expect(statements).toContain("where e.ref like 'fee:' || p_id || ':%'")
    expect(statements).toContain('having sum(l.credit - l.debit) <> 0')
    expect(statements).toContain('if old.void_at is not null then return old; end if;')
  })

  it('writes no row and rewrites no ledger entry', () => {
    expect(statements).not.toMatch(/\b(insert into|update public\.|delete from|alter table|truncate)\b/i)
  })

  it('the student view appends advance_amount and still carries neither fee nor adjustment as a column', () => {
    const view = statements.slice(statements.indexOf('create or replace view public.student_fee_record'))
    const columns = view.slice(0, view.indexOf('from public.fee_collection_records'))
    expect(columns).toMatch(/f\.updated_at,\s+case when f\.fee_amount is null then 0/)
    expect(columns).toMatch(/as advance_amount\s*$/)
    expect(columns).not.toMatch(/^\s*f\.(fee|adjust)_amount,?\s*$/m)
    expect(view).toMatch(/where f\.void_at is null/)
  })

  it('closes the new functions, pins search_path and ends with a schema reload', () => {
    expect(statements).toContain('revoke execute on function public.fee_gl_fine_part(numeric, numeric) from public, anon, authenticated;')
    expect(statements).toContain('revoke execute on function public.fee_gl_reverse(uuid, uuid, text) from public, anon, authenticated;')
    for (const d of statements.match(/security definer[^$]*\$\$/g) ?? []) expect(d).toContain('set search_path = public')
    expect(statements.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})

// The same arithmetic as the SQL above, replayed against a ledger kept as
// per-account nets (credit-positive, like gl_line). It checks the RULE — that
// the figures balance and net out — not the database.
describe('the 0258 rule, replayed', () => {
  type State = { pay: number; fine: number }
  type Ledger = Record<string, number>
  const poisha = (n: number) => Math.round(n * 100)
  const finePart = (s: State) => Math.max(Math.min(poisha(s.fine), poisha(s.pay)), 0)
  const post = (ledger: Ledger, from: State | null, to: State) => {
    const feeDelta = poisha(to.pay) - finePart(to) - (from ? poisha(from.pay) - finePart(from) : 0)
    const fineDelta = finePart(to) - (from ? finePart(from) : 0)
    ledger.fee = (ledger.fee ?? 0) + feeDelta
    ledger.fine = (ledger.fine ?? 0) + fineDelta
    ledger.cash = (ledger.cash ?? 0) - (feeDelta + fineDelta)
  }
  const reverse = (ledger: Ledger) => {
    for (const k of Object.keys(ledger)) ledger[k] = 0
  }
  const taka = (l: Ledger) => ({ cash: (0 - l.cash) / 100, fee: l.fee / 100, fine: l.fine / 100 })

  it('fee 100, fine 10, received 60: cash 60 = fine 10 + fee 50 (not 70)', () => {
    const l: Ledger = {}
    post(l, null, { pay: 60, fine: 10 })
    expect(taka(l)).toEqual({ cash: 60, fee: 50, fine: 10 })
  })

  it('received 130: cash 130 in all (not 140)', () => {
    const l: Ledger = {}
    post(l, null, { pay: 130, fine: 10 })
    expect(taka(l)).toEqual({ cash: 130, fee: 120, fine: 10 })
  })

  it('an edit from 60 to 130 lands on the same figures as a fresh 130', () => {
    const l: Ledger = {}
    post(l, null, { pay: 60, fine: 10 })
    post(l, { pay: 60, fine: 10 }, { pay: 130, fine: 10 })
    expect(taka(l)).toEqual({ cash: 130, fee: 120, fine: 10 })
  })

  it('a fine-only edit moves no cash', () => {
    const l: Ledger = {}
    post(l, null, { pay: 60, fine: 10 })
    post(l, { pay: 60, fine: 10 }, { pay: 60, fine: 25 })
    expect(taka(l)).toEqual({ cash: 60, fee: 35, fine: 25 })
  })

  it('never credits a fine that was not received', () => {
    const l: Ledger = {}
    post(l, null, { pay: 6, fine: 10 })
    expect(taka(l)).toEqual({ cash: 6, fee: 0, fine: 6 })
    const none: Ledger = {}
    post(none, null, { pay: 0, fine: 10 })
    expect(taka(none)).toEqual({ cash: 0, fee: 0, fine: 0 })
  })

  it('a record posted under the OLD rule keeps its overstatement through an edit, and a void clears it', () => {
    // 0097: cash = pay + fine. Fee 100, fine 10, received 60 put 70 into cash.
    const l: Ledger = { fee: 6000, fine: 1000, cash: -7000 }
    post(l, { pay: 60, fine: 10 }, { pay: 110, fine: 10 })
    // The edit itself is right (+50 cash); the 10 from before is still there.
    expect(taka(l)).toEqual({ cash: 120, fee: 110, fine: 10 })
    reverse(l)
    expect(Object.values(l).every((v) => v === 0)).toBe(true)
  })
})
