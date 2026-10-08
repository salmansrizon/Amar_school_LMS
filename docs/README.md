# docs/

Documentation for Amar School LMS (Next.js + Supabase, multi-tenant; the app is in `web/`). Status of each entry: **current** (describes how the system works or is being built now), **reference** (stable background), **record** (dated report or handoff, true when written, not maintained).

Many files keep their old names and paths because code comments, migrations, tests and ADRs cite them. Do not rename or move a file without searching `web/` first.

The static HTML prototype that used to live in `ui/` (and the GitHub Pages redirect in the root `index.html`) was retired on 2026-10-05. Code comments and ADR 0006 still name `ui/...` files as the design they were built from; those files are in git history only.

## Start here

- [ARCHITECTURE.md](./ARCHITECTURE.md) (current): how the stack, engines and ADRs fit together.
- [`CONTEXT.md`](../CONTEXT.md) (current, repo root): glossary of domain terms. Read before naming anything.
- [008_development_standards.md](./008_development_standards.md) (reference): engineering standards.
- [master_prd.md](./master_prd.md) (reference): product and architecture context that code comments cite as "master_prd.md doc 00N".
- [handoff/2026-10-03-owner-ui-staging-sync.md](./handoff/2026-10-03-owner-ui-staging-sync.md) (current): what is in flight right now.

## Product

- [PRD.md](./PRD.md) (reference): original web-rebuild PRD.
- [PRD_exteded.md](./PRD_exteded.md) (reference): PRD v2, partner management and dynamic policy, with user stories and acceptance criteria. File name is misspelled; kept.
- Philosophy series, cited from code as "doc 00N" (reference): [001 super admin](./001_super_admin.md), [002 partner ecosystem](./002_partner_ecosystem.md), [003 subscription and revenue](./003_subscription_revenue.md), [004 SMS commerce](./004_sms_commerce.md), [005 financial](./005_finantial_portal.md), [006 policy and features](./006_policy_feature.md), [007 workflow and events](./007_workflow_event_architeccture.md), [009 LLM development](./009_LLM_development.md). Names of 005 and 007 are misspelled; kept.
- Module task specs (current): [010 exam list actions and back-navigation](./010_exam_module.md), [010 exam system UI reorganisation](./010_exam_system.md), [011 class and section selection](./011_student_module.md), [012 section-scoped roll and default subjects](./012_student_roll_default_subject.md), [012 super admin portal requirements](./012_super_admin_ui.md), [013 owner UI overhaul map](./013_owner_ui_overhaul_map.md).
- [improvement.md](./improvement.md) (current): exam-module feature list (admit card, venues, seat plan, attendance sheet, printing); cited by about 23 code sites.
- [ui.md](./ui.md) (reference): super-admin UI simplification notes; embeds [image.png](./image.png), [image-1.png](./image-1.png), [image-2.png](./image-2.png).
- [ux-audit.md](./ux-audit.md) (record, 2026-08-04) and [ux-journey-map.md](./ux-journey-map.md) (record): older UX scorecard and owner journey map. Kept at the root until it is shown that newer audits replace them.

Known oddities: two documents numbered 010 and two numbered 012 (code that writes `docs/012` means the student roll one; ADRs 0010, 0011, 0012 and 0014 cite `012_super_admin_ui.md`).

## Architecture and decisions

- [ARCHITECTURE.md](./ARCHITECTURE.md) (current) and [008_development_standards.md](./008_development_standards.md) (reference), as above.
- [adr/](./adr/README.md) (reference): 32 decision records with an [index](./adr/README.md). Never moved or renumbered; two share number 0006.
- [`CONTEXT.md`](../CONTEXT.md): glossary, repo root.

## Current work

- [handoff/2026-10-03-owner-ui-staging-sync.md](./handoff/2026-10-03-owner-ui-staging-sync.md) (current): running handoff of the owner UI overhaul and staging sync. Versioned as a snapshot; the working copy keeps being appended to.
- [handoff/migration-index-703.md](./handoff/migration-index-703.md) (current): every database change recommended by the overhaul and audits; source of GitHub issue #703.
- [testing/owner-workflow-audit-2026-10-03/](./testing/owner-workflow-audit-2026-10-03/README.md) (current): owner and head-teacher workflow audit, eight files.
- [testing/student-portal-audit-2026-10-04/](./testing/student-portal-audit-2026-10-04/audit.md) (current): student portal audit and [implementation plan](./testing/student-portal-audit-2026-10-04/implementation-plan.md).
- [handoff/repo-cleanup-2026-10-05.md](./handoff/repo-cleanup-2026-10-05.md) (record): what was removed from the repo top level.

## Testing

- [testing/playwright-crud-plan.md](./testing/playwright-crud-plan.md) (current): CRUD plan cited as "playwright-crud-plan §N" from `web/e2e`.
- [testing/uat-plan.md](./testing/uat-plan.md) (reference) and [uat-checklist.md](./testing/uat-checklist.md) (reference): human acceptance plan and per-persona sheet.
- Reports (record): [staging-owner-superadmin-uat-report.md](./testing/staging-owner-superadmin-uat-report.md) (read its corrections annex first), [uat-pass3-report.md](./testing/uat-pass3-report.md) (path cited by `web/e2e/uat-pass3.mjs`), [staging-portal-uat-report.md](./testing/staging-portal-uat-report.md), [student-portal-434-ui-audit.md](./testing/student-portal-434-ui-audit.md).

## Research

All reference unless noted. In [research/](./research/): [Bangladesh market compliance gap analysis](./research/2026-08-29-bangladesh-market-compliance-gap-analysis.md), [attendance summary impact](./research/2026-09-26-attendance-summary-impact.md) (record, cited by migration 0217), [owner UI/UX patterns](./research/2026-09-26-owner-ui-ux-patterns.md), [290 distributor invoicing](./research/290-distributor-invoicing.md), [526 session cookie](./research/526-session-cookie.md), [543 security headers](./research/543-security-headers.md), and four school-owner studies ([dashboard feature presentation](./research/school-owner-dashboard-feature-presentation.md), [E2E flow UI patterns](./research/school-owner-e2e-flow-ui-patterns.md), [existing journey audit](./research/school-owner-existing-journey-audit.md), [journey cross-validation](./research/school-owner-ui-journey-cross-validation.md)).

## Archive

[archive/](./archive/README.md): two superseded handoffs (student portal map #434, map #524), each listed with what replaced it. The record of this reorganisation, with per-file evidence, is in [_revamp/inventory.md](./_revamp/inventory.md).
