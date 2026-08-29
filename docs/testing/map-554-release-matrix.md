# Map 554 Release Matrix

The release candidate must pass the included package boundary in both Bangla
and English on desktop and mobile, using a clean disposable tenant.

## Automated Gates

| Gate | Command/evidence | Exit |
|---|---|---|
| Type safety | `npm run typecheck` | Pass |
| Unit/integration | `npm test`, `npm run test:unit`, `npm run test:integration` | No unexplained failure |
| Security/RLS | `negative-access.test.ts`, `rls.test.ts`, class-scope tests, security-header tests | No unauthorized result |
| Financial | ledger balance, invoice numbering, payment lifecycle, SMS purchase, settlement tests | No impossible money state |
| Build | `npm run build` | Pass |
| Browser journeys | `npm run test:e2e` plus the persona UAT checklist | Every included journey passes |

## Persona Journeys

- Owner: student admission, attendance, exam/results, fee payment/receipt,
  SMS compose/package flow, notices, approvals, and institute setup.
- Staff: granted screens work; ungranted screens and owner-only purchases fail
  clearly through UI and data/API paths.
- Student: own dashboard, routine, notices, tasks, materials, results,
  attendance, leave, questions, fees, and profile requests.
- Distributor/Agent: agreement/onboarding, CRM/tasks, invoices/print, wallet,
  and assigned-only access where included.
- Government Official: territory read-only dashboard/search with no write,
  export, or cross-territory access.

## Evidence Format

For each journey record persona, tenant, device, language, commit, environment,
timestamp, expected result, observed result, screenshot/log on failure, severity,
and retest link. A clean tenant and zero Blocker/Major findings are mandatory;
shared-fixture counts do not constitute release evidence.
