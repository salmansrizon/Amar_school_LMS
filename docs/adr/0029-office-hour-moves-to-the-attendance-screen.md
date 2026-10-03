# Office Hour moves from the Institute Screen to the Attendance Screen

**Status**: accepted

Office Hour (ADR 0026) lived at `/school/institute/office-hour`, gated by the `institute` grant purely because `screenKeyForPath` (`web/lib/auth/screens.ts`) decides a route's Screen from its first `/school/` path segment alone — there is no per-screen parent/child or multi-key gating model in this codebase. Office Hour is moving into Attendance's UI (Employees group, first tab) so its route now lives under `/school/attendance/...`. Under the same first-segment rule, that route change *is* a grant change: Office Hour is now gated by `attendance`, not `institute`. There was no way to move the page without also moving the grant — the two are the same fact, not two decisions.

Grilled explicitly: keeping the route under `/school/institute/office-hour` while making it merely *appear* as a tab inside Attendance's UI (a cross-module link, not a real move) was rejected — it would leave every other Attendance tab pointing at `/school/attendance/*` while one lived somewhere else, breaking the tab-bar's own "each tab is a real route in this module" convention (`AttendanceTabs`' own doc comment), and it would keep Office Hour gated by `institute` while visually presented as part of Attendance, which is exactly the confusion a Screen is supposed to prevent (CONTEXT.md's Screen entry: a Screen is what a School Owner is deciding when they set a Staff User up, not a page's visual neighborhood).

## Considered options

- **A — Leave the route under `/school/institute/office-hour`, add a UI-only link/tab pointing there from Attendance.** Rejected: `institute` stays the effective grant despite the page now reading as Attendance's, and it introduces a route that breaks the "every Attendance tab is a real Attendance route" pattern.
- **B — Move the route under `/school/attendance/...`, accepting the grant flips to `attendance` (chosen).** Consistent with every other Attendance tab; the grant now matches what a School Owner is actually deciding when they hand out Attendance access.

## Consequences

- A Staff User previously granted `institute` but not `attendance` loses Office Hour access; a Staff User granted `attendance` but not `institute` gains it. This is a real, immediate access change for any School with Staff Users split across those two grants — not merely a navigation change.
- Office Hour is removed entirely from Institute Setup's own tab bar (`InstituteTabs`) — one home, no duplicate route or cross-module link, so there is exactly one grant a School Owner needs to reason about for this Screen.
- Any future page-relocation across Screens in this codebase carries the same consequence by construction (see the updated Screen entry in CONTEXT.md) — there is no way to move a route between top-level segments without also moving its grant, short of introducing a multi-key gating model this codebase doesn't have today.
