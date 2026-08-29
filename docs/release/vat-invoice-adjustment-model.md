# VAT Invoice and Adjustment Model

Implementation-ready model awaiting legal/tax approval. No rate or exemption
is assumed in application code.

## Canonical Record

Each invoice line must retain the supply type, quantity, unit amount, tax
treatment key, tax rate/effective date, taxable amount, tax amount, exemption
or zero-rating reason, and legal/source reference. The invoice header must
retain supplier identity, customer identity, currency, serial/register
identity, issue date, due date, and inclusive/exclusive pricing mode.

## Adjustments

Refunds, credit notes, debit notes, and reversals must be immutable documents
linked to the original invoice. Each adjustment records reason, approver,
original line references, taxable/tax reversal amounts, provider refund ID when
present, reconciliation status, and the balancing GL entries. Partial and full
adjustments must never edit the original financial document.

## Tax-Neutral Boundary

`pending` is an explicit unresolved tax-treatment state. It is stored as
configuration only: the application does not calculate VAT, infer exemptions,
issue NBR-compliance claims, or treat pending as zero-rated.

## Approval Gate

Before implementation is marked approved, record the legal entity, TIN/BIN or
turnover-tax position, supply classification for subscriptions/implementation/
SMS/collection, tax-inclusive rule, withholding treatment, required invoice
fields, effective date, and written adviser/source evidence. Until that record
exists, the model status is BLOCKED and the system must not present itself as
NBR-compliant.
