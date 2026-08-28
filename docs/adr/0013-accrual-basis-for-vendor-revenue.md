# ADR 0013 — Vendor subscription revenue is accrual-basis; school fee collection stays cash-basis

Status: Accepted (map #458, BD/ICAB-IFRS alignment)

## Context

ADR 0009 fixed GL posting for `fee_collection_records` as cash-basis: money
posts to income when collected, and waivers/receivables post nothing. That is
correct for a School's own tuition collection.

The vendor's *own* revenue is different: a subscription. A School prepays twelve
months (Subscription Code) or is billed monthly. Company accounts in Bangladesh
follow IFRS as adopted by ICAB, under which revenue is recognised as the service
is delivered and a prepayment is a liability until then. Booking a twelve-month
prepayment entirely into the month of receipt overstates that month's income,
leaves no deferred-revenue balance to tie out, and gives "Total Outstanding" no
counterpart in the ledger — all standard audit findings for a subscription
business.

## Decision

**Two books, two bases, by entity:**

- **Vendor-side revenue (subscriptions, module charges, SMS sales) is
  accrual-basis.** Issuing an invoice posts Accounts Receivable / Deferred
  Revenue. Each month of service released posts Deferred Revenue / Subscription
  Income. Receiving payment posts Cash / Accounts Receivable — payment settles a
  receivable, it does not recognise income. Distributor commission accrues as
  Commission Expense / Commission Payable in the same period as the revenue it
  relates to; a settlement payment debits Commission Payable.
- **School-side fee collection stays cash-basis, exactly as ADR 0009 defines.**
  That is the tenant's own bookkeeping, not the vendor's, and nothing in this
  decision touches it.

Consequences for figures already shown in the panel: "Total Outstanding" becomes
the Accounts Receivable balance, and deferred revenue becomes a reportable
balance rather than an implicit one.

## Consequences

- New GL accounts and posting rules: Accounts Receivable, Deferred/Unearned
  Revenue, Commission Payable, plus the monthly revenue-release posting.
- A monthly release job runs alongside the billing run; a period with no release
  is an audit gap, so the job's runs are recorded and visible.
- ADR 0009 remains in force for the school fee module; this ADR narrows it to
  that scope rather than replacing it.
- Cash-basis figures (what was actually collected this month) remain available —
  they are a report over payments, not the basis of the books.
