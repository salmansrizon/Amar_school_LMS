# Bangladesh Market Compliance Gap Analysis

**Assessment date:** 2026-08-29  
**Product:** Amar School LMS  
**Scope:** Private schools and Bangladesh government institutions; Amar School/LMS company is the merchant of record.

## Executive decision

**Current decision: NOT READY for live payment launch or government procurement submission.**

The LMS has a credible financial-control foundation: integer minor-unit amounts, double-entry ledger posting, immutable ledger read policies, idempotent posting, auditable invoice numbering, configurable tax rows, invoice receipts, and audit events. However, the current product explicitly defers live gateway integration, and the implemented payment model is manual confirmation. VAT is presently a configurable calculation/reporting capability, not a demonstrated NBR-operational compliance implementation. Refunds, credit/debit notes, gateway callbacks/IPN, provider reconciliation, merchant onboarding evidence, and direct bank integrations are not demonstrated.

This is a **readiness assessment**, not a legal opinion, NBR certificate, Bangladesh Bank licence, gateway approval, security certification, or government acceptance certificate.

## Regulatory and procurement baseline

| Area | Evidence-based baseline | Product consequence |
|---|---|---|
| VAT | NBR guidance describes VAT-inclusive supply pricing and a 15% example, and says VAT becomes payable at supply, invoice, receipt, or when the payable amount is determined. Education-related exemptions exist in the First Schedule, so the exact treatment of LMS subscriptions, implementation, SMS, and school fee collection must be confirmed for the company’s facts. [NBR VAT FAQ](https://nbr.gov.bd/faq/vat-faq/eservices/e-services/vatcalculator/ban) | Do not hard-code “education is exempt” or “all software is 15%”. Store tax treatment by supply type, effective date, customer type, and legal basis. Obtain written tax advice and validate the company’s BIN/VAT status. |
| Payment regulation | Bangladesh Bank’s Payment Systems Department regulates/licences/oversees payment systems and distinguishes PSP and PSO functions. Its payment-systems page also records 2FA requirements for online/e-commerce/interbanking/card-not-present transactions and publishes transaction-limit information. [Bangladesh Bank Payment Systems](https://www.bb.org.bd/en/index.php/financialactivity/paysystems) | Amar School should use licensed/acquiring providers and complete their merchant onboarding. It must not present itself as a PSP/PSO unless separately authorised. Gateway contracts, settlement account ownership, chargeback/refund rules, KYC, limits, 2FA, and dispute handling become release evidence. |
| e-GP | BPPA describes e-GP as the government procurement lifecycle, including registration, e-tendering, e-contract management, e-payment, audit, security administration, and exceptions. The 2025 guideline says public procurement using e-GP is channelled through the e-GP infrastructure and records procurement activity. [BPPA e-GP overview](https://www.bppa.gov.bd/e-gp.html), [e-GP guideline PDF](https://www.bppa.gov.bd/upload/policyandprocedure/2025-06-23-15-51-24-2025-03-13-15-01-22-e-GP-Guideline-4846-Planning-12-March-2025%282833-2895%29.pdf) | e-GP is a tender/procurement channel, not a product certification. Readiness means eligible supplier registration, tender response evidence, technical proposal, financial proposal, tax/trade documents, SLA, support, security, backup/DR, implementation plan, and acceptance criteria tailored to each tender. |

## Current LMS evidence

| Capability | Status | Evidence |
|---|---|---|
| Central financial model | Partial but strong foundation | The financial design makes the company the central financial authority and supports configurable tax, refunds, settlements, and reconciliation as intended capabilities in [docs/005_finantial_portal.md](/Users/salmansakib/Documents/Projects/Amar_school_LMS/docs/005_finantial_portal.md). |
| Invoices and receipts | Implemented for current manual flow | `invoices`, `invoice_lines`, and `payments` exist; invoices use BDT and integer minor units; invoice creation posts AR, income, and tax payable entries in [0086_invoicing_payments.sql](/Users/salmansakib/Documents/Projects/Amar_school_LMS/web/supabase/migrations/0086_invoicing_payments.sql). A receipt route exists at [receipt/[id]/page.tsx](/Users/salmansakib/Documents/Projects/Amar_school_LMS/web/app/school/fees/receipt/[id]/page.tsx). |
| VAT calculation | Partial | `tax_config` and `tax_resolve` exist, but the default VAT rate is 0% and the model is generic. There is no demonstrated tax-registration profile, supply classification, VAT invoice schema, official return export, VAT adjustment lifecycle, or legal verification in [0088_financial_review_fixes.sql](/Users/salmansakib/Documents/Projects/Amar_school_LMS/web/supabase/migrations/0088_financial_review_fixes.sql). |
| Ledger integrity | Implemented foundation | Double-entry constraints, idempotent `gl_post`, immutable ledger policies, and tax payable account are present in [0085_general_ledger.sql](/Users/salmansakib/Documents/Projects/Amar_school_LMS/web/supabase/migrations/0085_general_ledger.sql). |
| Invoice numbering | Implemented foundation | Gapless per-year counter and auditable counter policies are present in [0168_invoice_numbers_are_gapless_by_construction.sql](/Users/salmansakib/Documents/Projects/Amar_school_LMS/web/supabase/migrations/0168_invoice_numbers_are_gapless_by_construction.sql) and [0169_invoice_number_counters_are_auditable.sql](/Users/salmansakib/Documents/Projects/Amar_school_LMS/web/supabase/migrations/0169_invoice_number_counters_are_auditable.sql). Historical numbering discontinuities remain an audit matter and need a documented opening-balance/register treatment. |
| Audit trail | Implemented foundation | Financial mutations call `record_audit`; the server audit engine is documented in [web/lib/engines/audit/engine.ts](/Users/salmansakib/Documents/Projects/Amar_school_LMS/web/lib/engines/audit/engine.ts) and the audit schema/policies in [0078_audit_log.sql](/Users/salmansakib/Documents/Projects/Amar_school_LMS/web/supabase/migrations/0078_audit_log.sql). Retention, export, monitoring, time synchronisation, privileged-access review, and independent evidence preservation are not yet established by this assessment. |
| Refunds and adjustments | Missing for the requested scope | The financial design mentions refunds, credit notes, debit notes, and adjustments, but the reviewed payment implementation only supports pending/confirmed/void manual payments. A production VAT flow needs immutable reversal documents, reason/approver, original-document linkage, tax reversal, gateway refund reference, and reconciliation. |
| Live gateways | Missing | The PRD explicitly lists real payment gateway integration as a v1 non-goal and the payment RPC is a manual record/confirm flow in [docs/PRD.md](/Users/salmansakib/Documents/Projects/Amar_school_LMS/docs/PRD.md) and [0086_invoicing_payments.sql](/Users/salmansakib/Documents/Projects/Amar_school_LMS/web/supabase/migrations/0086_invoicing_payments.sql). No bKash, SSLCommerz, Nagad, Rocket, card, NPSB, or direct bank adapter was found in the reviewed source. |
| Reconciliation | Partial / not payment-provider ready | The ledger is idempotent, but provider settlement files, callback/IPN replay handling, signature/authentication checks, duplicate transaction protection, settlement batching, fees/MDR, chargebacks, partial refunds, and exception queues are not demonstrated. |
| Government operations | Partial | Government Official is a read-only, territory-scoped oversight role in the domain model. Procurement deliverables such as SLA, RTO/RPO, incident response, support escalation, accessibility, deployment/acceptance test packs, training, and exit/data portability are not yet a complete tender evidence pack. |
| Security and tenant isolation | Strong evidence, still requires release testing | The project has RLS and authorization tests, but payment launch needs a dedicated security assessment covering webhook endpoints, secret storage, replay, SSRF, rate limits, export/download authorization, audit tamper resistance, backup restore, and payment-data minimisation. Prior staging memory also records unresolved authorization/session findings, so those must be closed and re-tested before a compliance claim. |

## Release-blocking gaps

1. **Establish the legal/tax operating profile.** Confirm the company’s legal entity, trade licence, TIN, BIN/VAT registration or turnover-tax position, registered address, supply classification, tax-inclusive/exclusive pricing, invoice/receipt requirements, withholding handling, and treatment of each revenue stream. Record the legal basis and effective date in configuration.
2. **Implement a provider adapter boundary.** One internal payment intent model should support provider, merchant account, invoice, amount, currency, customer, return URL, callback state, provider transaction ID, settlement ID, fees, and immutable status transitions. Do not build a separate financial calculation path per gateway.
3. **Implement secure asynchronous gateway flows.** Add server-side initiation, authenticated callback/IPN handling, provider-side validation, idempotency, timeout/pending states, replay protection, amount/invoice matching, duplicate detection, and a manual exception queue. SSLCommerz’s official developer documentation requires server-side APIs, TLS 1.2+, IPN/validation, live public-IP registration, and server-side order validation. [SSLCommerz developer docs](https://developer.sslcommerz.com/doc/v4/)
4. **Implement refunds and tax documents.** Add credit/debit notes or equivalent legally reviewed adjustment documents, original invoice linkage, approval, partial/full refund, tax reversal, gateway refund ID, GL contra-posting, and reconciliation status.
5. **Implement VAT evidence, not only a rate.** Add supplier/customer tax identity fields, invoice serial/register controls, tax breakdown by line, inclusive/exclusive calculation mode, exemptions/zero-rated reason, adjustment references, period reports, export, and immutable versions. Validate required fields and formats with NBR or a VAT practitioner.
6. **Complete gateway and bank onboarding.** Obtain merchant accounts and written integration requirements for SSLCommerz, bKash, Nagad/Rocket, card/acquirer routes, and each direct bank route. Direct government-bank integration is not one standard: each bank may impose its own API, host-to-host, security, settlement, KYC, procurement, and operational requirements.
7. **Produce a government UAT/tender pack.** Include architecture, data-flow diagram, threat model, access matrix, test traceability, performance results, backup restore evidence, DR exercise, RTO/RPO, monitoring, incident response, support contacts/escalation, SLA, privacy/data retention, deployment/versioning, training, acceptance criteria, warranty, exit/data export, and supplier eligibility documents.
8. **Close security findings before claiming readiness.** Run an independent penetration test or equivalent security review, then re-test all findings. Payment endpoints and cross-tenant exports are release gates, not optional hardening.

## Minimum acceptance test pack

| Test group | Required evidence |
|---|---|
| VAT arithmetic | VAT-inclusive and VAT-exclusive examples; rounding; zero/invalid rates; exemptions; effective-date changes; refund and credit-note reversal; ledger tie-out. |
| Invoice controls | Unique/gapless numbering per required period; void/adjustment behaviour; duplicate prevention; immutable history; PDF/print content; customer BIN/NID rules where applicable. |
| Payment lifecycle | Initiated, pending, success, failure, timeout, duplicate callback, forged callback, amount mismatch, wrong invoice, provider validation failure, partial payment, full payment, refund, chargeback, and manual exception. |
| Reconciliation | Provider transaction-to-invoice match; settlement batch-to-bank match; MDR/fees; missing/duplicate/late records; retry; operator approval; unresolved exception ageing. |
| Authorization | School isolation; merchant-admin separation; least privilege; refund approval; audit export restrictions; webhook secret isolation; stale-session and replay checks. |
| Reliability | Backup restore; RTO/RPO demonstration; queue retry; provider outage; database outage; no duplicate financial posting after retry; alerting and runbook. |
| Government UAT | Role-based workflows, reports, print/export, Bengali/English content where tendered, accessibility, onboarding, training, acceptance sign-off, defect severity and retest evidence. |

## Recommended delivery order

**Gate 0:** Legal/tax and gateway onboarding decisions.  
**Gate 1:** VAT document model, payment-intent model, provider adapter, refunds, reconciliation, and audit hardening.  
**Gate 2:** SSLCommerz and bKash sandbox-to-live certification, then one bank route; expand only after the common lifecycle is proven.  
**Gate 3:** Security assessment, backup/DR exercise, operational rehearsal, and UAT evidence.  
**Gate 4:** Government tender/e-GP supplier pack tailored to the specific procuring entity and tender document.

## Sources and limits

This assessment uses the repository state inspected on 2026-08-29 and the primary sources linked above. Bangladesh tax rules, payment regulations, gateway contracts, PPR/e-GP requirements, and tender-specific criteria can change. Before commercial launch, obtain current written confirmation from NBR/a qualified Bangladesh VAT adviser, Bangladesh Bank or the acquiring institution where applicable, each gateway/bank, and the procuring entity’s tender documents.
