# Security and Tenant-Isolation Gate

Release evidence for the security decision in map #554. A redirect or hidden
button is not authorization evidence; each capability must be checked through
the data/API seam as well.

## Required Checks

| Area | Pass condition | Evidence |
|---|---|---|
| Tenant reads | Owner, staff, distributor, agent, student, and government users cannot read another tenant's rows by list, detail, guessed ID, stale tab, or copied URL. | `tests/integration/negative-access.test.ts`, `rls.test.ts` |
| Tenant writes | A caller-supplied school/tenant ID cannot redirect a write into another tenant. | `negative-access.test.ts` |
| Class/subject scope | Attachments narrow grants; a missing attachment fails closed. | `class-attachment-scope.test.ts` |
| Export/print/download | Every export, print view, signed URL, and background job repeats the source authorization check. | Add route-by-route evidence before release. |
| Session revocation | A revoked grant stops working on an already-open session without relying on re-login. | `negative-access.test.ts` |
| Payment callbacks | Raw payload hash, provider authentication evidence, provider/intent/amount matching, replay dedupe, and secret isolation all pass. | `payment-provider-lifecycle.test.ts` |
| Browser policy | HSTS, CSP, frame protection, referrer policy, MIME sniffing, and framework disclosure checks pass. | `tests/unit/security-headers.test.ts` |
| Abuse controls | Webhook and authentication endpoints have rate limits, bounded payloads, timeouts, and safe error responses. | Runtime/security-test evidence required. |

## Exit Rule

Any cross-tenant read/write, unauthorized export, forged/replayed callback,
secret exposure, or unresolved penetration-test High/Critical finding blocks
release. Record the test date, commit, environment, persona, request shape,
result, and remediation link for every check.
