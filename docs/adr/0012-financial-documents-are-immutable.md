# ADR 0012 — Issued financial documents are immutable; corrections are new linked documents

Status: Accepted (map #458, docs/012_super_admin_ui.md §6/§30)

> **Amended by [ADR 0022](0022-gapless-numbering-serialises-its-issuers.md).** The
> requirement below stands unchanged. What 0022 settles is *how* a gapless number is
> allocated: a Postgres `SEQUENCE` cannot be gapless — `nextval` is non-transactional
> by design, so a rolled-back issue burns its number permanently — and the numbering
> clause below was implemented with one. It is now a counter row incremented inside
> the issuing transaction, at the cost of serialising concurrent issuers. Read 0022
> before touching invoice or receipt numbering.

## Context

The vendor expects an external audit firm to be able to trace every transaction
from a printed register back to its source document. Doc 012 §30 calls for
"immutable transaction history"; §6 lists invoice states including Cancelled and
Adjusted, which could be read as "edit the invoice".

An edit-with-audit-log model (Super Admin may change an issued invoice, the log
records before/after) preserves a *record of change* but not *document
integrity*: a statement printed last quarter stops matching the database, and
the invariant `collected = distributor payable + platform net` stops holding for
past periods.

## Decision

**Once issued, a financial document never changes.**

- **Invoice**: amounts are fixed at issue. A correction is a **new linked
  document** (adjustment/credit note) carrying negative `invoice_lines` and
  referencing the original. Cancellation is a void with a **mandatory reason**;
  the number is retained and never reused.
- **Numbering**: gapless sequence per financial year. A gap is an audit finding,
  so numbers are allocated at issue, not at draft.
- **Payment**: a wrong payment is voided with a reason and re-recorded, never
  edited. Receipt numbers follow the same gapless rule.
- **Draft** is the only mutable state, and a draft has no number.
- Status values stay `draft | issued | paid | void` in the database.
  **Partially Paid** and **Overdue** are *derived* at read time (confirmed
  payment sum vs total; `due_at` vs today), `void` renders as **Cancelled**, and
  **Adjusted** means "has a linked adjustment note". No status is stored that
  can drift from the underlying rows.

## Consequences

- A School or Distributor statement can be reprinted at any time and always
  shows the same figures — the property that makes it trustworthy to the partner
  as well as to the auditor.
- The UI offers "issue adjustment" and "void with reason" instead of an edit
  button on issued documents.
- Registers (invoice, payment/receipt, commission & settlement) can be printed
  for any past period and will reconcile against the trial balance.
