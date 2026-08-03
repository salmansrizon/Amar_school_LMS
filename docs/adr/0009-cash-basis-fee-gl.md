# ADR 0009 — Fee GL posting is cash-basis

Status: Accepted (map #258, #271 follow-up)

## Context

The central-GL integration (0093/0097) posts `fee_collection_records` money
movements into the double-entry General Ledger. A review flagged that the
`adjust_amount` (waiver/discount) and `due_amount` (outstanding receivable) legs
of a fee record post no GL entry.

## Decision

Fee GL posting is **cash-basis**. Only cash movements post to the GL:

- `pay_amount` → Cash/Bank debit, Fee Income credit
- `fine_amount` → Cash/Bank debit, Fine Income credit
- deletes/edits → reversing contra

`adjust_amount` (a waiver — money never collected) and `due_amount` (money not
yet collected) are **non-cash** and correctly generate **no** GL entry under
cash-basis accounting. Recognising them would require an **accrual** model
(debit Accounts Receivable / credit Income at assessment, Cash settling A/R on
payment), which would change the meaning of the existing `pay_amount → Income`
entries and risk double-counting.

## Consequences

- The GL and `financial_summary` reflect actual cash earned, consistent with how
  the rest of the platform (subscriptions, SMS, commissions) posts on real money
  movement.
- If accrual reporting (outstanding receivables in the GL, aged debtors) is later
  required, it is a separate, deliberate migration — not a bug in the current
  cash-basis design.
