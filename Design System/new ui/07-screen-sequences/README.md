# School Owner — Screen Sequences

This folder contains 40 full-resolution Stitch references for the School Owner/Admin redesign: five feature groups × four journey stages × desktop and mobile.

These are visual redesign references only. They preserve the current product routes, permissions, feature gates, design tokens, and Bangla-first language decision; they do not change application code or authorisation behavior.

## Stage meaning

| Stage | Purpose |
| --- | --- |
| `01-entry` | Arrival in the feature group or its current operational landing context. |
| `02-action` | The primary in-progress task. |
| `03-review` | The durable record, register, receipt, or saved-access outcome. |
| `04-recovery` | A cause-specific empty, blocked, or unsaved-work state with one clear route forward. |

## Routes and journey intent

| Group | 01 Entry | 02 Action | 03 Review / outcome | 04 Recovery |
| --- | --- | --- | --- | --- |
| Overview | `/school` owner dashboard | `/school/approvals` decision inbox | `/school` with compact “all caught up” state | expired subscription gate for `/school/*` |
| People | `/school/students` | `/school/students/new` admission form | `/school/students/[id]` record | no-match student filters, clear filters |
| Academics | Academic module entry | `/school/attendance/mark` manual register | `/school/attendance/book` | selected class offering has no students |
| Finance & Communication | `/school/fees` | `/school/fees#collect-form` selected record | `/school/fees/receipt/[id]` | fees page requires a class offering |
| Administration | Institution/staff entry context | `/school/staff/[id]` individual grants | `/school/staff/[id]` effective grants | unsaved individual grants confirmation |

## Files

Each row is a matching desktop/mobile pair. The PNGs were downloaded from the original Stitch image endpoints (`=s0`), not the 512px previews.

| Group | Entry | Action | Review | Recovery |
| --- | --- | --- | --- | --- |
| Overview | `overview-01-entry-*` | `overview-02-action-*` | `overview-03-review-*` | `overview-04-recovery-*` |
| People | `people-01-entry-*` | `people-02-action-*` | `people-03-review-*` | `people-04-recovery-*` |
| Academics | `academics-01-entry-*` | `academics-02-action-*` | `academics-03-review-*` | `academics-04-recovery-*` |
| Finance & Communication | `finance-communication-01-entry-*` | `finance-communication-02-action-*` | `finance-communication-03-review-*` | `finance-communication-04-recovery-*` |
| Administration | `administration-01-entry-*` | `administration-02-action-*` | `administration-03-review-*` | `administration-04-recovery-*` |

Use the `-desktop.png` and `-mobile.png` counterpart together. Mobile references use a closed drawer by default, retain route-backed local tabs when relevant, and deliberately avoid a competing bottom navigation bar.

## Non-negotiable implementation constraints

- The five sidebar groups are visual organisation only. Every leaf must retain its existing href and grant/feature check; unavailable items are hidden, not disabled.
- User-facing labels are Bangla for the active language selection. Do not introduce bilingual UI as a new convention.
- People has separate recovery causes: no-match clears filters; no class assignment returns to dashboard; a truly empty roster permits admission.
- Academics is the real manual attendance path: choose class offering/date → mark register → Attendance Book or Student Log. Do not add RFID, automatic reconciliation, or a fabricated results flow.
- Fees, SMS, Notices, and Messages & Requests remain separate route families. Fee collection creates or edits the existing record and leads to a receipt/ledger review; it never implies automatic communication.
- Staff access remains owner-only and is granted by individual screen toggles. Do not add role templates, group grants, disabled Staff navigation, or Staff access to Staff.
- Expired subscription content is replaced by the real owner renewal-code gate, not a dismissible dashboard warning.

## Reference evidence

The flow decisions were cross-validated against the existing source and primary-source UX guidance:

- [Current school-owner journey audit](../../../docs/research/school-owner-existing-journey-audit.md)
- [E2E UI pattern research](../../../docs/research/school-owner-e2e-flow-ui-patterns.md)
- [Independent route and permission cross-validation](../../../docs/research/school-owner-ui-journey-cross-validation.md)

When a generated image contains incidental sample metadata, use the route/stage table and the constraints above as the source of truth. The image defines hierarchy, component behaviour, layout, status placement, and responsive treatment—not new product capabilities.
