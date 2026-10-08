// Accounting I helpers (issue #34, PRD §5.6): Fee/Fine/Scholarship-Discount
// split arithmetic, the absent-fine amount arithmetic, and the fee-structure
// copy-between-class/year payload builder. Kept pure for unit testing.
//
// The working-days formula itself (Total − Off Days − Approved Leave −
// Present, with off-day/leave overlap handling) is NOT reimplemented here —
// it lives exactly once, in is_absent_working_day (0021, absence-SMS #12),
// and the absent_working_days_in_month RPC (0039) reuses that function
// day-by-day. A parallel TypeScript copy of that per-day rule would be dead
// weight (nothing calls it) and a second place the definition could drift;
// the RPC's behaviour is covered by tests/integration/fee-structures.test.ts.

/** Fee (prescribed) + Fine − Scholarship/Discount, floored at zero. */
export function totalPayable(feeAmount: number, fineAmount: number, adjustAmount: number): number {
  return Math.max(0, feeAmount + fineAmount - adjustAmount)
}

/** Shortfall between total payable and what was actually received. */
export function dueAmount(totalPayableAmount: number, receivedAmount: number): number {
  return Math.max(0, totalPayableAmount - receivedAmount)
}

/** Absent working days × the per-day fine rate; negative inputs clamp to zero. */
export function absentFineAmount(absentDays: number, ratePerDay: number): number {
  return Math.max(0, absentDays) * Math.max(0, ratePerDay)
}

// Fee structures (copy-between-class/year).

export interface FeeStructureCore {
  fee_type: 'monthly' | 'one_time_yearly'
  amount: number
  fine_per_absent_day: number
}

export interface FeeStructureCopyPayload extends FeeStructureCore {
  class_id: string
  academic_year: number
}

const MIN_YEAR = 2000
const MAX_YEAR = 2100

/** Builds the upsert payload for copying a Fee Structure to another Class/Year:
 *  carries fee_type/amount/fine rate as-is, retargets class_id + academic_year. */
export function buildFeeStructureCopy(
  source: FeeStructureCore,
  targetClassId: string,
  targetYear: number,
): FeeStructureCopyPayload {
  if (!targetClassId) throw new Error('target class is required')
  if (!Number.isInteger(targetYear) || targetYear < MIN_YEAR || targetYear > MAX_YEAR) {
    throw new Error('target year must be a valid year')
  }
  return {
    class_id: targetClassId,
    academic_year: targetYear,
    fee_type: source.fee_type,
    amount: source.amount,
    fine_per_absent_day: source.fine_per_absent_day,
  }
}

/** Monthly Fee Standing (CONTEXT.md) for one Fee Collection Record; null when
 *  the month has no record yet — not billed is not unpaid. */
export type FeeStanding = 'paid' | 'partial' | 'due'
export function feeStanding(record: { pay_amount: number; due_amount: number } | undefined): FeeStanding | null {
  if (!record) return null
  if (record.due_amount <= 0) return 'paid'
  return record.pay_amount > 0 ? 'partial' : 'due'
}

/** A month's Fee Collection Records folded into the fee page's headline
 *  figures (map 013 FC1). `unpaid` counts Due standings (nothing received). */
export type MonthFeeSummary = {
  records: number
  collected: number
  due: number
  paid: number
  partial: number
  unpaid: number
}
export function summarizeMonthFees(rows: { pay_amount: number; due_amount: number }[]): MonthFeeSummary {
  const out: MonthFeeSummary = { records: rows.length, collected: 0, due: 0, paid: 0, partial: 0, unpaid: 0 }
  for (const r of rows) {
    out.collected += r.pay_amount
    out.due += Math.max(0, r.due_amount)
    const s = feeStanding(r)
    if (s === 'paid') out.paid++
    else if (s === 'partial') out.partial++
    else out.unpaid++
  }
  return out
}

// Money is compared in whole poisha so float noise (0.1 + 0.2) never reads as
// a shortfall or an overpayment.
function toPoisha(amount: number): number {
  return Math.round(amount * 100)
}

/** What was billed for a saved Fee Collection Record. The record keeps only
 *  pay/fine/adjust/due (CONTEXT.md), so the fee is read back out of the
 *  identity the collection form saved it with: due = fee + fine − adjust − pay.
 *  Exact while something is still due. Once due is 0 the record cannot tell an
 *  exact payment from an overpayment, so this returns the fee that makes the
 *  stored figures add up — never the misleading 0 the edit form used to show. */
export function billedFeeAmount(record: {
  pay_amount: number
  fine_amount: number
  adjust_amount: number
  due_amount: number
}): number {
  return (
    Math.max(0, toPoisha(record.pay_amount + record.due_amount - record.fine_amount + record.adjust_amount)) / 100
  )
}

/** How much more than the total payable was received; 0 when not overpaid. */
export function overpaidAmount(totalPayableAmount: number, receivedAmount: number): number {
  return Math.max(0, toPoisha(receivedAmount) - toPoisha(totalPayableAmount)) / 100
}

type StoredFigures = {
  pay_amount: number
  fine_amount: number
  adjust_amount: number
  due_amount: number
  /** Stored billed fee (migration 0230); null/undefined on older rows. */
  fee_amount?: number | null
}

/** The billed fee of a saved record, and whether it is known or only
 *  reconstructed (#678). Known: the stored `fee_amount`, or — for a row saved
 *  before 0230 — the derivation while something is still due, which is exact.
 *  Not known: an older row with nothing due, where an exact payment and an
 *  advance are the same four numbers; `fee` is then the figure that makes them
 *  add up, for the edit form only — never to be stored or printed as the fee. */
export function recordFeeAmount(record: StoredFigures): { fee: number; exact: boolean } {
  if (record.fee_amount != null) return { fee: record.fee_amount, exact: true }
  return { fee: billedFeeAmount(record), exact: record.due_amount > 0 }
}

/** The advance sitting on a record: what was received beyond fee + fine −
 *  adjustment (#695). 0 when the fee is not stored — an advance is then
 *  indistinguishable from an exact payment and is not guessed at. */
export function advanceAmount(record: StoredFigures): number {
  if (record.fee_amount == null) return 0
  return overpaidAmount(totalPayable(record.fee_amount, record.fine_amount, record.adjust_amount), record.pay_amount)
}

/** The "Total" a receipt prints, and the amount it spells out in words: the
 *  money received, nothing added (#707). Owner's decision: `pay_amount`
 *  INCLUDES the fine — fee 100, fine 10, received 110 means 110 was paid in
 *  all. The fine and the adjustment are lines on the receipt, not additions to
 *  what was received; the receipt used to pass the received amount to
 *  totalPayable as if it were the fee, which counted the fine twice. */
export function receiptTotal(record: { pay_amount: number }): number {
  return record.pay_amount
}

/** One collection's figures from what the operator entered. The collection
 *  form's live preview and saveFeeRecord both call this, so the due amount that
 *  is stored is the one the server worked out — not a number the browser sent. */
export function settleFee(entry: { fee: number; fine: number; adjust: number; received: number }): {
  total: number
  due: number
  overpaid: number
} {
  const total = totalPayable(entry.fee, entry.fine, entry.adjust)
  return { total, due: dueAmount(total, entry.received), overpaid: overpaidAmount(total, entry.received) }
}

// Voiding a Fee Collection Record (#683, migration 0231).

/** Same number as the CHECK in migration 0231. */
export const VOID_REASON_MAX = 500

/** The trimmed reason, or null when it is empty or longer than the column
 *  allows. A void always carries a reason, and a too-long one is refused rather
 *  than clipped: what is stored is what the owner wrote. */
export function cleanVoidReason(reason: string | null | undefined): string | null {
  const trimmed = (reason ?? '').trim()
  return trimmed.length >= 1 && trimmed.length <= VOID_REASON_MAX ? trimmed : null
}

// The general-ledger postings of one Fee Collection Record.

/** `gl_entries.ref` LIKE pattern for one record's postings. The fee_gl_post
 *  trigger (0097) writes `fee:<record id>:<seq>` — one entry per write. The
 *  closing colon is what stops one id matching as a prefix of another ref. */
export function feeGlRefPattern(recordId: string): string {
  return `fee:${recordId}:%`
}

/** The column those postings are ordered by. `gl_entries` has no `created_at`
 *  (0085): ordering by it made PostgREST reject the whole read, and the receipt
 *  reported the missing rows as "no ledger entry" for a paid record. */
export const FEE_GL_ORDER_COLUMN = 'posted_at'

// The fee period (month/year) a screen is showing.

/** Month and year from URL params, falling back to `today` for anything that
 *  is not a real month / plausible year. Shared by the fees page and the
 *  students directory's `?fee=` filter, so an "unpaid list" link lands on the
 *  month it was clicked from. */
export function feePeriodFromParams(
  monthParam: string | undefined,
  yearParam: string | undefined,
  today: { month: number; year: number },
): { month: number; year: number } {
  const month = Number(monthParam)
  const year = Number(yearParam)
  return {
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : today.month,
    year: Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR ? year : today.year,
  }
}

/** "৭/২০২৬" or "7/2026" — both halves in the reader's digits (`locale` from
 *  localeOf), and the year never grouped into "২,০২৬". */
export function feePeriodLabel(month: number, year: number, locale: string): string {
  const fmt = new Intl.NumberFormat(locale, { useGrouping: false })
  return `${fmt.format(month)}/${fmt.format(year)}`
}
