// Pure aggregators for the super-admin financial views (#271). Kept out of the
// page components so the money math is unit-testable and not re-derived per view.

export interface GlLine {
  account_code: string
  debit: number
  credit: number
}

export interface AccountTotals {
  debit: number
  credit: number
}

export interface TrialBalance {
  perAccount: Map<string, AccountTotals>
  totalDebit: number
  totalCredit: number
  balanced: boolean
}

/** Fold gl_lines into per-account debit/credit totals + the grand totals. */
export function trialBalance(lines: GlLine[]): TrialBalance {
  const perAccount = new Map<string, AccountTotals>()
  let totalDebit = 0
  let totalCredit = 0
  for (const l of lines) {
    const t = perAccount.get(l.account_code) ?? { debit: 0, credit: 0 }
    t.debit += l.debit
    t.credit += l.credit
    perAccount.set(l.account_code, t)
    totalDebit += l.debit
    totalCredit += l.credit
  }
  return { perAccount, totalDebit, totalCredit, balanced: totalDebit === totalCredit }
}

export interface CommissionRow {
  distributor_id: string
  commission_amount: number
  status: string
}

/** Sum accrued-but-unsettled commission per distributor. */
export function accruedByDistributor(commissions: CommissionRow[]): Map<string, number> {
  const accrued = new Map<string, number>()
  for (const c of commissions) {
    if (c.status !== 'accrued') continue
    accrued.set(c.distributor_id, (accrued.get(c.distributor_id) ?? 0) + c.commission_amount)
  }
  return accrued
}
