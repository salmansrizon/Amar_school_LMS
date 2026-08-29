# Bangladesh Readiness Gate

This is the release gate for the commercial and government-readiness map. It
records evidence and unresolved decisions; it is not a legal, tax, payment,
security, or tender certificate.

## Decision Status

| Map decision | Current status | Required before release |
|---|---|---|
| Legal and tax operating profile | BLOCKED | Bangladesh company selected; legal name, TIN/BIN status, registered address, revenue classifications, and written adviser confirmation remain pending. |
| Government buyer and tender profile | BLOCKED | No buyer or tender has been selected; make no buyer-specific claims until its document and obligations are supplied. |
| Security and tenant-isolation gate | BASELINE READY | Run the required negative-access, export/print, stale-session, webhook, secret, rate-limit, and penetration-test evidence against the release candidate. |
| Reliability and operations evidence bar | BASELINE READY | Attach backup restore, RTO/RPO, outage/retry, monitoring, incident-response, retention, portability, and deployment rehearsal evidence for the selected buyer. |
| First commercial package | PROPOSED | Scope, monthly hybrid pricing, manual payment, Bangla/English, and deferred capabilities confirmed; support channel and response target remain to be recorded. |
| VAT invoice and adjustment model | BLOCKED | Tax Treatment `pending` is confirmed; resolve the legal/tax profile before approving rates, effective dating, invoice/register fields, refunds, credit/debit notes, or reconciliation rules. |
| Component, integration, E2E, and UAT matrix | BASELINE READY | Execute the included-scope matrix on a clean tenant in Bangla and English across desktop and mobile; no Blocker or Major may remain. |

## Evidence Index

- [UAT checklist](../testing/uat-checklist.md)
- [UAT execution plan](../testing/uat-plan.md)
- [Staging UAT report](../testing/staging-owner-superadmin-uat-report.md)
- [Provider-neutral payment lifecycle ADR](../adr/0023-provider-neutral-payment-lifecycle.md)
- [Security header tests](../../web/tests/unit/security-headers.test.ts)
- [Authorization negative tests](../../web/tests/integration/negative-access.test.ts)
- [Payment lifecycle integration tests](../../web/tests/integration/payment-provider-lifecycle.test.ts)
- [Security and tenant-isolation gate](./security-tenant-isolation-gate.md)
- [Reliability and operations evidence](./reliability-operations-evidence.md)
- [Commercial package boundary](./commercial-package-boundary.md)
- [VAT invoice and adjustment model](./vat-invoice-adjustment-model.md)
- [Government tender evidence template](./government-tender-evidence-template.md)
- [Map 554 release matrix](../testing/map-554-release-matrix.md)

## Release Rule

The product may claim only compliance-readiness while any decision is BLOCKED.
Live payment launch additionally requires provider onboarding and a real
provider adapter; government submission additionally requires a buyer-specific
tender pack. A passing application test suite does not replace either gate.

## Required Sign-off Record

Before changing a BLOCKED row to APPROVED, record the decision owner, source
document or contract, effective date, scope, and review date in the relevant
map ticket and link the evidence here. Do not encode an unresolved legal or
tender assumption as a default in application code.
