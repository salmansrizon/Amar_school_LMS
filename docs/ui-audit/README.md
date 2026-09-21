# UI Audit and Simplification Strategy

Source brief: [`docs/Ui_audit.md`](../Ui_audit.md)

This document set records the UI audit plan and recommended UI direction for all user roles. It is documentation-only: no application code is changed here.

> Note: on this Windows checkout, `docs/Ui_audit.md` and `docs/UI_AUDIT.md` cannot coexist because paths are case-insensitive. The original brief stays at `docs/Ui_audit.md`; this folder README is the audit index.

## Audit destination

Create a route-backed, role-by-role UI audit and simplification strategy for Amar School LMS. The audit should help future development simplify the product around user journeys, not just polish individual screens.

## Decisions captured

- Keep `docs/Ui_audit.md` as the original audit brief/checklist.
- Use `docs/ui-audit/README.md` as the index and summary.
- Put role-specific audits under `docs/ui-audit/`.
- Cover all users at journey-level depth.
- For School Owner/Staff, use `Design System/new ui/` as the primary recommended UI reference.
- For Student, use task-first portal journeys rather than admin-style groups.
- For every role file: journey strategy first, key findings second, compact route inventory last.
- Use severity format: `Severity - issue type`, for example `High - workflow friction`.
- Audit unfinished/placeholder screens normally and mark them `placeholder/incomplete` where applicable.
- Include recommended UI references and image links so future development can follow visual examples.

## Role audit files

| Area | File | Depth | Primary simplification model |
| --- | --- | --- | --- |
| School Owner/Staff | [`school.md`](./school.md) | Deep | Five grouped journeys from `Design System/new ui/` |
| Student | [`student.md`](./student.md) | Deep | Student task portal |
| Super Admin | [`super-admin.md`](./super-admin.md) | Journey-level | Operations/control-center groups |
| Distributor | [`distributor.md`](./distributor.md) | Journey-level | Sales pipeline + account/finance |
| Agent | [`agent.md`](./agent.md) | Journey-level | Task queue |
| Government Official | [`gov.md`](./gov.md) | Journey-level | Oversight dashboard |
| Auth and shared shell | [`auth-shared.md`](./auth-shared.md) | Cross-cutting | Entry, recovery, global chrome |
| UAT failure analysis | [`uat-failure-analysis.md`](./uat-failure-analysis.md) | Remediation | Failed final UAT blockers and rerun plan |
| Record Quick View | [`record-quick-view.md`](./record-quick-view.md) | UX standard | Row/card summary drawer pattern |
| Design grid system | [`design-grid-system.md`](./design-grid-system.md) | UI foundation | `Design System/new ui/` visual references and grid rules |
| Motion/status animation | [`motion-status-animation.md`](./motion-status-animation.md) | Interaction | Pulse/status animation rules and reduced-motion requirements |

## Shared recommended UI principles

1. **Use `Design System/new ui/` as the visual source of truth** - follow its grouped sidebar, card hierarchy, action hierarchy, mobile drawer/sheet behavior, and recovery-state examples.
2. **Use the documented grid system** - apply [`design-grid-system.md`](./design-grid-system.md), existing spacing tokens, and page archetypes instead of ad-hoc layout.
3. **Workflow-first navigation** - group pages by jobs users are trying to complete.
4. **Preserve existing routes and permissions** - grouping is presentation; do not break grants, feature flags, or deep links.
5. **Three-stage hierarchy** - each journey should support `find/orient -> act/edit -> review/recover`.
6. **Record Quick View for lists** - row/card click opens a summary drawer; edit behavior depends on module risk.
7. **One dominant primary action** per page/stage; secondary actions must have text labels.
8. **Cause-specific recovery states** - no generic empty/error dead ends.
9. **Meaningful motion** - use pulse/status animation for live, pending, unread, saving, and recovery states; never animate only for decoration.
10. **Bangla-first user-facing copy** according to the active language; avoid mixed-language helper text.
11. **Mobile must be touch-safe** - 16px gutters, controls at least 44px high, drawer/submenu pattern rather than cramped desktop tables.
12. **Use the existing institutional SaaS visual language** - Plus Jakarta Sans, purple primary, neutral surfaces, semantic status colors, rounded cards, subtle borders.

## Recommended UI reference set

Primary source: [`Design System/new ui/README.md`](../../Design%20System/new%20ui/README.md)

School Owner reference groups:

- Overview: [`school-owner-dashboard-desktop.png`](../../Design%20System/new%20ui/01-overview/school-owner-dashboard-desktop.png), [`school-owner-dashboard-mobile.png`](../../Design%20System/new%20ui/01-overview/school-owner-dashboard-mobile.png)
- People: [`student-directory-desktop.png`](../../Design%20System/new%20ui/02-people/student-directory-desktop.png), [`student-admission-desktop.png`](../../Design%20System/new%20ui/02-people/student-admission-desktop.png), [`employees-directory-desktop.png`](../../Design%20System/new%20ui/02-people/employees-directory-desktop.png)
- Academics: [`classes-curriculum-desktop.png`](../../Design%20System/new%20ui/03-academics/classes-curriculum-desktop.png), [`attendance-desktop.png`](../../Design%20System/new%20ui/03-academics/attendance-desktop.png), [`exams-results-desktop.png`](../../Design%20System/new%20ui/03-academics/exams-results-desktop.png)
- Finance & Communication: [`fees-finance-desktop.png`](../../Design%20System/new%20ui/04-finance-communication/fees-finance-desktop.png), [`sms-center-desktop.png`](../../Design%20System/new%20ui/04-finance-communication/sms-center-desktop.png), [`notices-desktop.png`](../../Design%20System/new%20ui/04-finance-communication/notices-desktop.png), [`messages-requests-desktop.png`](../../Design%20System/new%20ui/04-finance-communication/messages-requests-desktop.png)
- Administration: [`institution-settings-desktop.png`](../../Design%20System/new%20ui/05-administration/institution-settings-desktop.png), [`staff-permissions-desktop.png`](../../Design%20System/new%20ui/05-administration/staff-permissions-desktop.png)

Flowboard references:

- [`Design System/new ui/06-detailed-flowboards/README.md`](../../Design%20System/new%20ui/06-detailed-flowboards/README.md)
- [`Design System/new ui/07-screen-sequences/README.md`](../../Design%20System/new%20ui/07-screen-sequences/README.md)

## Current route count

The current app contains **158** route screens from `web/app/**/page.tsx`.

## Current UAT status

Final UAT is currently **not ready for sign-off**. See [`uat-failure-analysis.md`](./uat-failure-analysis.md) for blockers, recommended fixes, and rerun order.

## Priority summary

| Priority | Area | Why |
| --- | --- | --- |
| 1 | School Owner/Staff + Student | Critical daily workflows: admission, attendance, fees, exams/results, communication |
| 2 | Shared shell/navigation | All roles share `AppShell`; improvements compound globally |
| 3 | Super Admin | Highest route count after School; needs grouped operations model |
| 4 | Distributor/Agent/Gov | Smaller surfaces but still need journey-level consistency |
