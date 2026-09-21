# Super Admin UI Audit

## Intended users

Platform super administrators who manage schools, partners, billing, SMS commerce, configuration, audit, and operational monitoring.

## Recommended UI model

Group the current large sidebar into operational journeys. Preserve every current route/href.

| Recommended group | Current routes | Purpose |
| --- | --- | --- |
| Overview & Monitoring | `/super-admin`, attendance job monitor, workflows, notifications | See platform health and act on operational exceptions. |
| Schools & Accounts | schools, upcoming schools, partners/distributors, agents, gov officials | Manage the people and organizations in the ecosystem. |
| Territory & Sales Ops | locations, clusters, codes, coupons, agreements | Configure territory/sales/account acquisition tooling. |
| Billing & Commerce | invoices, settlements, accounting, subscription config, SMS, SMS commerce | Manage money, subscriptions, and SMS commercial flows. |
| Governance & Security | role permissions, audit log, module config, off-days | Configure platform behavior and review sensitive changes. |

## Key current UI findings

| Finding | Severity | Recommended improvement |
| --- | --- | --- |
| Super Admin has 20+ peer nav items. | High � navigation complexity | Use grouped sidebar sections with current active section expanded. |
| Search/notifications are noted as arriving per role, but Super Admin shell currently relies mainly on nav-derived search. | Medium � findability | Add record-aware search for schools, partners, invoices, users, config pages. |
| Several routes are configuration screens with similar risk. | High � operational risk | Use consistent save/review/recovery states and audit confirmation. |
| Monitoring routes and configuration routes are mixed in one list. | Medium � mental-model friction | Separate live operations from setup/configuration. |

## UAT failures to fix in Super Admin flows

See the full matrix in [`uat-failure-analysis.md`](./uat-failure-analysis.md).

| Failure | Severity | Recommended fix |
| --- | --- | --- |
| Agreement publish/version creation does not show the newly-created row. | High - governance workflow | Fix publish -> refresh/list readback and make the created version visible deterministically. |
| Agreement read screen does not show Recent acceptances / accepted locked state. | High - governance workflow | Reconfirm the expected Agreement UI contract, then repair accepted-version status, lock text, and acceptance list rendering. |
| Markdown rendering/editing of agreement versions fails. | Medium - content workflow | Ensure saved Markdown is rendered in read mode and editable only for unaccepted versions. |
| Settlement run/approve/pay cannot find the expected draft row. | High - money workflow | Verify accrual seed, period filters, created draft visibility, status transitions, and money formatting. |

## Recommended UI references

No dedicated Super Admin image set exists in `Design System/new ui/`. Reuse the shared AppShell and adapt the School Owner grouped-sidebar pattern from [`sidebar journey map`](../../Design%20System/new%20ui/00-reference/sidebar-journey-map-desktop.png) and [`overview flowboard`](../../Design%20System/new%20ui/06-detailed-flowboards/overview-flowboard-desktop.png).

## Compact route inventory

| Route | Intended user | Purpose | Recommended group | Audit note |
| --- | --- | --- | --- | --- |
| `/super-admin` | Super Admin | Dashboard | Overview & Monitoring | Entry/orientation. |
| `/super-admin/schools`, `/schools/[id]`, `/schools/upcoming` | Super Admin | Manage schools | Schools & Accounts | Core entity management. |
| `/super-admin/partners`, `/partners/[id]` | Super Admin | Manage distributors/partners | Schools & Accounts | Rename consistency: partners vs distributors. |
| `/super-admin/agents`, `/agents/[id]` | Super Admin | Manage agents | Schools & Accounts | Detail route. |
| `/super-admin/gov-officials`, `/gov-officials/[id]` | Super Admin | Manage gov users | Schools & Accounts | Detail route. |
| `/super-admin/locations`, `/clusters` | Super Admin | Territory setup | Territory & Sales Ops | Group together. |
| `/super-admin/codes`, `/coupons`, `/agreements` | Super Admin | Acquisition/commercial tools | Territory & Sales Ops | Needs clear labels. |
| `/super-admin/invoices`, `/settlements`, `/accounting` | Super Admin | Finance operations | Billing & Commerce | Review/ledger patterns. |
| `/super-admin/sms`, `/sms-commerce` | Super Admin | SMS operations/commerce | Billing & Commerce | Clarify difference. |
| `/super-admin/subscription-config` | Super Admin | Subscription setup | Billing & Commerce | Configuration risk. |
| `/super-admin/module-config` | Super Admin | Feature/module setup | Governance & Security | High-impact config. |
| `/super-admin/role-permissions` | Super Admin | Role config | Governance & Security | Critical auth risk. |
| `/super-admin/audit-log` | Super Admin | Audit review | Governance & Security | Needs filtering/search. |
| `/super-admin/off-days` | Super Admin | Platform off-days | Governance & Security | Setup screen. |
| `/super-admin/attendance-job-monitor` | Super Admin | Job monitor | Overview & Monitoring | Operational health. |
| `/super-admin/workflows` | Super Admin | Workflow monitor/config | Overview & Monitoring | Clarify if config or monitoring. |
| `/super-admin/notifications` | Super Admin | Notifications | Overview & Monitoring | Inbox. |
