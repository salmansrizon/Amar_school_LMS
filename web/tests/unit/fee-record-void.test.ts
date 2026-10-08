import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanVoidReason, VOID_REASON_MAX } from '@/lib/fees'
import { buildGeneralLedger, feeLedgerRows } from '@/lib/accounting'

describe('cleanVoidReason (#683)', () => {
  it('trims and keeps a real reason', () => {
    expect(cleanVoidReason('  wrong student  ')).toBe('wrong student')
  })

  it('refuses an empty or missing reason', () => {
    expect(cleanVoidReason('')).toBeNull()
    expect(cleanVoidReason('   \n ')).toBeNull()
    expect(cleanVoidReason(null)).toBeNull()
    expect(cleanVoidReason(undefined)).toBeNull()
  })

  it('refuses, rather than clips, a reason longer than the column allows', () => {
    expect(cleanVoidReason('x'.repeat(VOID_REASON_MAX))).toHaveLength(VOID_REASON_MAX)
    expect(cleanVoidReason('x'.repeat(VOID_REASON_MAX + 1))).toBeNull()
  })
})

describe('feeLedgerRows (#683)', () => {
  const paid = { pay_amount: 500, updated_at: '2026-07-03T05:00:00.000Z' }

  it('an active record is one credit, dated by updated_at as before', () => {
    expect(feeLedgerRows(paid, 'Rahim — 7/2026', 'Voided')).toEqual([
      {
        date: '2026-07-03',
        sortKey: '2026-07-03T05:00:00.000Z',
        source: 'fee_collection',
        description: 'Rahim — 7/2026',
        debit: 0,
        credit: 500,
      },
    ])
    expect(feeLedgerRows({ ...paid, void_at: null }, 'x', 'Voided')).toHaveLength(1)
  })

  it('a voided record keeps its credit and adds the same amount back out on the void day', () => {
    const rows = feeLedgerRows({ ...paid, void_at: '2026-07-09T10:00:00.000Z' }, 'Rahim — 7/2026', 'Voided')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ date: '2026-07-03', credit: 500, debit: 0 })
    expect(rows[1]).toMatchObject({
      date: '2026-07-09',
      description: 'Rahim — 7/2026 — Voided',
      credit: 0,
      debit: 500,
    })
  })

  it('the pair nets to zero in the running balance, and the days in between still show the payment', () => {
    const rows = [
      ...feeLedgerRows({ pay_amount: 1200.5, updated_at: '2026-07-01T05:00:00.000Z' }, 'a', 'Voided'),
      ...feeLedgerRows({ ...paid, void_at: '2026-07-09T10:00:00.000Z' }, 'b', 'Voided'),
    ]
    const ledger = buildGeneralLedger(rows, '2000-01-01', '2100-01-01')
    expect(ledger.map((e) => e.balance)).toEqual([1200.5, 1700.5, 1200.5])
  })

  it('a voided record with nothing received adds no reversing row', () => {
    expect(
      feeLedgerRows({ pay_amount: 0, updated_at: paid.updated_at, void_at: '2026-07-09T10:00:00.000Z' }, 'x', 'Voided'),
    ).toHaveLength(1)
  })
})

// The SQL cannot be run here (the migration is not applied and the database is
// shared), so these pin the properties a reviewer must not lose in an edit.
describe('migration 0231', () => {
  const sql = readFileSync(join(__dirname, '../../supabase/migrations/0231_fee_record_void.sql'), 'utf8')
  const statements = sql.replace(/^\s*--.*$/gm, '')

  it('never updates, deletes or inserts a fee row', () => {
    expect(statements).not.toMatch(/\b(update|delete from|insert into)\s+public\.fee_collection_records/i)
    expect(statements).not.toMatch(/\btruncate\b/i)
  })

  it('creates the partial unique index before dropping the old constraint', () => {
    const index = statements.indexOf('create unique index if not exists one_active_fee_record_per_student_month')
    const drop = statements.indexOf('drop constraint if exists one_record_per_student_month')
    expect(index).toBeGreaterThan(-1)
    expect(drop).toBeGreaterThan(index)
    expect(statements).toMatch(/\(student_id, month, year\)\s+where void_at is null/)
  })

  it('the guard trigger sorts after fee_record_touch, so it can put updated_at back', () => {
    expect('fee_record_void_guard' > 'fee_record_touch').toBe(true)
    expect(statements).toContain('new.updated_at := old.updated_at')
  })

  it('the database, not the request, decides who voided and when', () => {
    expect(statements).toContain('new.void_at := now()')
    expect(statements).toContain('new.void_by := auth.uid()')
  })

  it('reverses through the same posting function and cash-account rule as 0097', () => {
    const m0097 = readFileSync(join(__dirname, '../../supabase/migrations/0097_fee_gl_review_fixes.sql'), 'utf8')
    const rule = "when new.payment_method = 'cash' then '1000' else '1050' end"
    expect(m0097).toContain(rule)
    expect(statements).toContain(rule)
    expect(statements).toContain('-round(new.pay_amount * 100)::bigint, -round(new.fine_amount * 100)::bigint')
  })

  it('a deleted voided row is not reversed a second time', () => {
    expect(statements).toContain('if old.void_at is not null then return old; end if;')
  })

  it('the student view keeps its eight columns and hides voided rows', () => {
    const view = statements.slice(statements.indexOf('create or replace view public.student_fee_record'))
    expect(view).toMatch(/where f\.void_at is null/)
    expect(view).not.toMatch(/adjust_amount|fee_amount|void_reason/)
  })

  it('definer functions pin search_path and the file ends with a schema reload', () => {
    const definers = statements.match(/security definer[^$]*\$\$/g) ?? []
    expect(definers.length).toBeGreaterThan(0)
    for (const d of definers) expect(d).toContain('set search_path = public')
    expect(statements.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})
