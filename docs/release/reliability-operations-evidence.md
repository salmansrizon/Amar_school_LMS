# Reliability and Operations Evidence

Operational evidence bar for the government-readiness map. Values remain
buyer-specific until a tender or contract supplies them.

## Required Evidence

| Capability | Minimum evidence | Status |
|---|---|---|
| Backup/restore | A fresh backup is restored into an isolated environment and core login, tenant isolation, invoices, ledger, and uploads are checked. | Required |
| RTO/RPO | Owner records agreed recovery time and data-loss objectives, then demonstrates both with timestamps. | Buyer-specific |
| Outage handling | Supabase, provider, storage, SMS, and queue failures produce bounded errors, retries where safe, and no duplicate financial posting. | Required |
| Monitoring | Health checks, error alerts, queue/job visibility, database/storage capacity, and payment exception ageing have named owners. | Required |
| Incident response | Severity definitions, contact tree, containment, customer notice, evidence preservation, and post-incident review are rehearsed. | Required |
| Deployment | Versioned migrations, rollback/forward plan, environment configuration, smoke checks, and release approval are recorded per deployment. | Required |
| Retention/export | Retention periods, deletion exceptions, tenant export, and exit handoff are approved for the buyer and applicable law. | Buyer-specific |
| Support | Hours, response targets, escalation, maintenance windows, training, warranty, and service credits are written into the commercial/tender pack. | Buyer-specific |

## Exit Rule

No release claim is made from a checklist alone. Each required row needs an
attached run record containing environment, commit, operator, timestamp,
expected result, observed result, and remediation reference.
