// Accounting II (issue #35, PRD §5.6): pure, unit-tested business rules for
// vouchers, asset depreciation, bank/cash + director-capital balance guards,
// and the consolidated General Ledger aggregation.
//
// The real money-safety guard (insufficient-balance rejection) is enforced in
// the database — apply_bank_cash_transaction / apply_director_capital_transaction
// (0055) lock the balance row and raise a real exception, matching Accounting
// I's "one Fee Collection Record per student per month" precedent of a
// DB-level constraint rather than a UI-only check. insufficientBalance below
// is only the UI-side mirror, so a form can disable/pre-validate without a
// round trip — see ui/school-owner/bank-cash-accounts.html's disabled
// "Confirm Withdraw" button when the amount exceeds the current balance.

/** True when a withdrawal of `amount` would take `balance` negative. */
export function insufficientBalance(balance: number, amount: number): boolean {
  return amount > balance
}

// Shared FormData amount parsing (code review finding: vouchers/assets/bank/
// director-capital actions.ts each parsed amount fields identically —
// consolidated here instead of four copies).

/** Parses a FormData amount field, requiring it to be > 0; NaN signals an
 *  invalid or non-positive input (the caller should reject the request). */
export function parsePositiveAmount(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? '0').trim() || 0)
  return Number.isFinite(n) && n > 0 ? n : Number.NaN
}

/** Parses a FormData amount field, requiring it to be >= 0; NaN signals an
 *  invalid or negative input (the caller should reject the request). */
export function parseNonNegativeAmount(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? '0').trim() || 0)
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN
}

/** Straight-line depreciation: the asset loses `ratePercent`% of its purchase
 *  value for each FULL year elapsed since purchase (a partial year in
 *  progress doesn't count yet), floored at zero. */
export function currentAssetValue(
  purchaseValue: number,
  ratePercent: number,
  purchaseDate: string | Date,
  asOfDate: string | Date = new Date(),
): number {
  const purchased = new Date(purchaseDate)
  const asOf = new Date(asOfDate)
  let years = asOf.getFullYear() - purchased.getFullYear()
  const anniversaryPassed =
    asOf.getMonth() > purchased.getMonth() ||
    (asOf.getMonth() === purchased.getMonth() && asOf.getDate() >= purchased.getDate())
  if (!anniversaryPassed) years -= 1
  years = Math.max(0, years)
  const depreciated = purchaseValue * (ratePercent / 100) * years
  return Math.max(0, purchaseValue - depreciated)
}

// General Ledger aggregation ------------------------------------------------
// PRD §5.6: "Consolidated General Ledger (director cash + assets + vouchers +
// bank + fee collections) for a date range." Each source contributes plain
// debit/credit rows (fetched RLS-scoped, one query per source — see
// app/school/fees/ledger/page.tsx); this merges them into one chronological
// ledger with a running balance.

export type LedgerSource = 'fee_collection' | 'voucher' | 'asset' | 'bank_cash' | 'director_capital'

export interface LedgerSourceRow {
  date: string // ISO date (YYYY-MM-DD)
  sortKey: string // ISO timestamp; tie-breaks same-day entries deterministically
  source: LedgerSource
  description: string
  debit: number
  credit: number
}

export interface LedgerEntry extends LedgerSourceRow {
  balance: number
}

/** Merges every source's rows into one chronological ledger with a running
 *  balance, then filters the visible rows to [from, to] (inclusive). The
 *  running balance is computed over ALL rows first — not just the ones in
 *  range — so narrowing the date range doesn't corrupt the Balance column. */
export function buildGeneralLedger(rows: LedgerSourceRow[], from: string, to: string): LedgerEntry[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0
  })
  let balance = 0
  const withBalance: LedgerEntry[] = sorted.map((row) => {
    balance += row.credit - row.debit
    return { ...row, balance }
  })
  return withBalance.filter((row) => row.date >= from && row.date <= to)
}
