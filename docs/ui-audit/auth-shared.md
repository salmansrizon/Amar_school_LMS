# Auth and Shared UI Audit

## Shared UI surfaces

- `AppShell`: unified webframe for role layouts with collapsible sidebar, topbar, search palette, language/theme/profile/logout controls, mobile drawer.
- Role shells: School, Student, Super Admin, Distributor, Agent, Gov.
- Cross-role pages: login, reset password, claim, notifications, verification, error/blocked states.

## Key current UI findings

| Finding | Severity | Recommended improvement |
| --- | --- | --- |
| `AppShell` is shared across roles, so navigation improvements can be centralized. | High � leverage | Add grouped nav support once and configure per role. |
| School shell flattens child nav items even though design reference calls for expandable groups. | High � navigation complexity | Introduce visual grouping/expand state while preserving current route permissions. |
| Student, Distributor, Agent, Gov use shared AppShell but mostly flat role nav. | Medium � consistency | Use route groups only where helpful; do not overcomplicate small roles. |
| Search exists globally but role-specific record coverage varies. | Medium � findability | Define per-role search sources and fallback to nav search. |
| Auth/recovery pages shape first impression and support burden. | High � trust | Use clear role-aware copy, next steps, and support/retry paths. |
| Error pages and blocked states can become dead ends. | Critical � recovery | Every blocked/error screen should provide cause, allowed next action, and safe destination. |

## UAT failures to fix in shared/auth/chrome flows

See the full matrix in [`uat-failure-analysis.md`](./uat-failure-analysis.md).

| Failure | Severity | Recommended fix |
| --- | --- | --- |
| Lint fails in shared/app code. | Critical - quality gate | Fix React compiler issues in claim page, exam controls, and shift selector before further UAT runs. |
| Playwright fixture helpers are flagged as React hooks. | Medium - tooling | Rename helper functions or scope ESLint rules so E2E fixtures are not treated as React components/hooks. |
| Distributor/Gov UX capture reaches `/distributor` but times out waiting for load. | Medium - test stability | Replace load-event waits with visible-page landmarks or inspect long-running requests that prevent the load event. |
| Shared AppShell currently supports flat nav better than grouped nav. | High - navigation UX | Add grouped nav capability once, then configure per role without breaking current hrefs. |

## Recommended UI references

- Grouped sidebar reference: [`sidebar-journey-map-desktop.png`](../../Design%20System/new%20ui/00-reference/sidebar-journey-map-desktop.png)
- Recovery-state examples: [`07-screen-sequences README`](../../Design%20System/new%20ui/07-screen-sequences/README.md)
- Administration unsaved/recovery examples: [`administration recovery desktop`](../../Design%20System/new%20ui/07-screen-sequences/administration-04-recovery-desktop.png)

## Compact route inventory

| Route | Intended user | Purpose | Recommended journey | Audit note |
| --- | --- | --- | --- | --- |
| `/` | Visitor/authenticated redirect | Landing or role routing | Entry | Confirm role redirects are clear. |
| `/login` | All users | Sign in | Auth entry | Needs role/error clarity. |
| `/reset-password` | All users | Request reset | Auth recovery | Recovery flow. |
| `/reset-password/update` | All users | Set new password | Auth recovery | Must confirm success next step. |
| `/claim` | Invited/claiming users | Claim account/school | Auth/onboarding | High-trust flow. |
| `/verify/[token]` | Invited/verified users | Token verification | Auth/onboarding | Token failure recovery needed. |
| `/account-blocked` | Blocked users | Explain blocked account | Recovery | Must explain next action/support. |
| `/no-such-school` | Misrouted users | School not found | Recovery | Needs safe destination. |
| `/notifications` | Cross-role/shared users | Notifications | Communication | Check if duplicates role-specific inboxes. |
| `/not-found` and `error.tsx` | All users | Error states | Recovery | Avoid dead ends. |
