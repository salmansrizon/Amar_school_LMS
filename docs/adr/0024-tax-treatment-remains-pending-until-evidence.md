# ADR 0024 - Tax treatment remains pending until evidence

Status: Accepted (map #554 decision round)

## Context

The owner selected a Bangladesh company as the commercial entity, but the legal
name, TIN/BIN status, registered address, revenue classifications, and written
adviser evidence are not yet recorded. Guessing VAT rates or exemptions would
turn an unresolved legal decision into an application default.

## Decision

Tax treatment is represented explicitly as `pending` until the legal/tax profile
and supporting evidence are approved. Pending configuration does not calculate
VAT, infer exemptions, issue NBR-compliance claims, or act as a zero-rated rule.

The first Launch Package is monthly hybrid-priced, manual-payment only, and
Bangla/English. It makes no gateway, tender, residency, training, warranty, or
certification promise. Procurement Readiness remains blocked without a named
buyer and tender document.

## Consequences

- The product may claim compliance-readiness only.
- VAT invoices, adjustments, refunds, and reconciliation remain blocked.
- A future tax decision must record its owner, source, effective date, scope,
  and review date before implementation changes the pending boundary.
