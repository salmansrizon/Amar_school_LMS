// Financial Engine — SEAM ONLY (map #258, implemented in #265 wallet + #266 GL).
// Two layers: wallets (operational balances) + double-entry General Ledger
// (accounting truth). Every wallet move posts a GL entry. Also owns invoices,
// payments, tax, discount, commission, settlement — all event-driven and
// Super-Admin configurable. HEAVY FORKS pending owner confirm before #266:
// GL double-vs-single entry; payments manual-vs-gateway.

// Wallet types v1 (map #258 P2). company_sms/school_sms match the #252 wallet-
// primitive seed (company owns the physical SMS balance; each school gets a
// virtual SMS wallet); distributor_commission holds partner commission balances.
// Additional types (promo/refund/general-company) added additively later.
export type WalletType = 'company_sms' | 'school_sms' | 'distributor_commission'

/** SMS mask/non-mask route, reserved on ledger entries for the SMS phase. */
export type SmsRoute = 'mask' | 'non_mask'

export interface WalletLedgerEntry {
  walletId: string
  /** Monetary delta in integer minor units (poisha) to avoid float error;
   * null for pure quantity moves. At least one of amount/quantity is set. */
  amount: number | null
  /** Quantity delta, e.g. SMS segments; null for pure money moves. */
  quantity: number | null
  route: SmsRoute | null
  /** Idempotency key — a repeated post with the same ref is a no-op. */
  ref: string
  reason: string
}

export interface WalletEngine {
  balance(walletId: string): Promise<{ amount: number; quantity: number }>
  post(entry: WalletLedgerEntry): Promise<void>
}

export interface GeneralLedger {
  /** Post a balanced double-entry set (sum debits === sum credits), immutable
   * once posted. Amounts are integer minor units (poisha), never floats. */
  postEntry(input: {
    schoolId: string | null
    lines: { accountCode: string; debit: number; credit: number }[]
    ref: string
    memo: string
  }): Promise<void>
}

export interface FinancialEngine {
  wallet: WalletEngine
  ledger: GeneralLedger
}
