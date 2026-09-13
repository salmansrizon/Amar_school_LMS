# School Owner/Admin UI journey cross-validation

Cross-validation review for the Stitch redesign. This note is implementation
guidance for the screen sequences only; it does not change any route, Screen
identity, permission grant, feature flag, language choice, or design token.

## Result

The five proposed sidebar groups are a valid **presentation layer** over the
current School product, provided every item keeps its existing href and gate.
The highest-value additions for the remaining standalone screens are: a
conditional exception band that links to the correct queue, route-backed local
tabs, explicit recovery actions for each distinct empty state, a selected fee
record state, and an outcome that reflects the real receipt/ledger review.

## Verified feature map

| Visual sidebar group | Preserve these current destinations | Cross-validation constraint |
| --- | --- | --- |
| Overview | `/school`; contextual links to `/school/activity`, `/school/approvals`, `/school/questions`, and `/school/corrections` when the existing conditions apply | Dashboard is a member screen. Approvals is also a member screen, but its dashboard shortcut is currently Owner-only and the workflow itself determines whether a caller can decide. |
| People | `/school/students`, `/school/employees` and their existing contextual record routes | Both modules are separately grant-gated; Student login issuance remains an Owner-only contextual action, not a sidebar item. |
| Academics | `/school/classes`, `/school/attendance`, `/school/exams` | Attendance remains a child only in the data model, while the shell renders it in flat order; its separate `attendance` grant must remain intact. |
| Finance & Communication | `/school/fees`, `/school/sms`, `/school/notices`, and the Messages & Requests hub | Fees, SMS, Notices, and the hub have distinct route families and outcomes. The hub uses the always-available dashboard sentinel and RLS-scoped content; it is not the old feedback grant. |
| Administration | `/school/institute`, `/school/staff` | Institute is grant-gated; Staff is Owner-only and must be omitted for Staff Users rather than represented as disabled navigation. |

Evidence: [`web/lib/school-nav.ts`](../../web/lib/school-nav.ts#L18-L20),
[`web/lib/school-nav.ts`](../../web/lib/school-nav.ts#L23-L65),
[`web/lib/auth/screens.ts`](../../web/lib/auth/screens.ts#L19-L37),
[`web/lib/auth/screens.ts`](../../web/lib/auth/screens.ts#L48-L88), and
[`web/lib/auth/screens.ts`](../../web/lib/auth/screens.ts#L147-L157).

## Findings to adopt in the remaining screen sequences

| # | Finding and first-party evidence | Implementation action | Stages affected |
| --- | --- | --- | --- |
| 1 | The existing sidebar input has just one authored child relationship (Classes → Attendance), and `SchoolShell` deliberately flattens every child in visible order. Each candidate item is then checked with `canOpenScreen` and the school feature set before it is rendered. [`web/lib/school-nav.ts`](../../web/lib/school-nav.ts#L23-L36); [`web/components/school-shell.tsx`](../../web/components/school-shell.tsx#L26-L46); [`web/components/school-shell.tsx`](../../web/components/school-shell.tsx#L62-L73) | Render the five groups as collapsible visual containers only. Use the current route on every leaf; hide unavailable leaves completely. On a sequence screen, expand the current group and retain the direct Dashboard item. Do not make group headings permissions, destinations, or disabled rows. | 01 entry |
| 2 | Dashboard quick actions are already filtered by `canOpenScreen`. Its Messages & Requests card appears only when a caller’s RLS-scoped backlog is non-zero, and each count goes directly to Questions or Corrections—not a generic inbox landing page. [`web/app/school/page.tsx`](../../web/app/school/page.tsx#L146-L176); [`web/app/school/page.tsx`](../../web/app/school/page.tsx#L194-L224); [`web/app/school/page.tsx`](../../web/app/school/page.tsx#L291-L324) | Make the full-width “Needs attention” band conditional. Display the actual exception count and a text action to its existing route; when nothing is pending, replace the band with the compact “All caught up” status. Keep the existing quick-action destinations as the action cluster. | 01 entry, 03 review/outcome |
| 3 | The student list explicitly distinguishes an unassigned caller, a no-match filter result, and a genuinely empty school roster. Only the last branch links to New Admission; no-match clears filters, while unassigned returns the caller to the dashboard. The list already exposes compact mobile cards with a text `View` action and table-row detail links. [`web/app/school/students/page.tsx`](../../web/app/school/students/page.tsx#L78-L100); [`web/app/school/students/page.tsx`](../../web/app/school/students/page.tsx#L112-L140); [`web/app/school/students/page.tsx`](../../web/app/school/students/page.tsx#L157-L163); [`web/app/school/students/page.tsx`](../../web/app/school/students/page.tsx#L196-L201) | In People, use a full-page admission form and a route-backed student record outcome. Keep the Class Catalogue label in filters and records. On mobile, use complete cards with an explicit Bangla “Open/View” text action. Draw three different recovery screens/actions rather than one generic empty state. | 01 entry, 02 action, 03 review/outcome, 04 recovery |
| 4 | `/school/attendance` redirects to `/school/attendance/mark`; RFID/automatic attendance is expressly disabled. The Mark screen uses existing route-backed attendance tabs, class/date filters, bulk and per-student marking, and three different empty-state exits. [`web/app/school/attendance/page.tsx`](../../web/app/school/attendance/page.tsx#L1-L7); [`web/app/school/attendance/attendance-tabs.tsx`](../../web/app/school/attendance/attendance-tabs.tsx#L4-L31); [`web/app/school/attendance/mark/page.tsx`](../../web/app/school/attendance/mark/page.tsx#L13-L34); [`web/app/school/attendance/mark/page.tsx`](../../web/app/school/attendance/mark/page.tsx#L67-L115) | Make the Academics sequence the real manual attendance journey: select Class Offering/date → mark register → use Attendance Book or Student Log tab to review. Preserve a separate recovery for unassigned staff, no Students, and no match. Do not add RFID, automatic reconciliation, or a fictional result-publication step to this sequence. | 02 action, 03 review/outcome, 04 recovery |
| 5 | Fee collection retains Class/month/year in the selected row href, marks that row with `aria-current` and the brand state, opens the existing `#collect-form`, and labels an existing monthly record as edit rather than collect. The page also presents a duplicate-record notice. [`web/app/school/fees/page.tsx`](../../web/app/school/fees/page.tsx#L167-L224); [`web/app/school/fees/page.tsx`](../../web/app/school/fees/page.tsx#L234-L250) | In Finance, show filters above the roster and visibly retain them after selecting a Student. Use the existing in-page collection form for the primary action; do not introduce a separate payment route or a second payment. The recovery screen should distinguish “choose a class” from “this class has no Students.” | 02 action, 04 recovery |
| 6 | Each existing Fee Collection Record has a receipt route. The receipt provides the record’s amount breakdown, payment method, print action, and an existing ledger-impact review linked to the ledger; edits post deltas rather than restating a total. [`web/app/school/fees/page.tsx`](../../web/app/school/fees/page.tsx#L255-L284); [`web/app/school/fees/receipt/[id]/page.tsx`](../../web/app/school/fees/receipt/[id]/page.tsx#L33-L49); [`web/app/school/fees/receipt/[id]/page.tsx`](../../web/app/school/fees/receipt/[id]/page.tsx#L51-L55); [`web/app/school/fees/receipt/[id]/page.tsx`](../../web/app/school/fees/receipt/[id]/page.tsx#L110-L139) | Make the Finance outcome a route-backed receipt/review screen with Print and “Open ledger” as contextual actions. It may offer SMS or Notice as a separate navigation choice elsewhere in the group, but it must not claim that a payment automatically sends a message. | 03 review/outcome |
| 7 | SMS has Compose, Rules, and Log routes; Notices has List, Create, and Gallery routes; Questions has a separate hub tab and content scoped by RLS. The Questions UI ranks unanswered topic groups and only renders a reply form where the caller can answer. [`web/app/school/sms/tabs.tsx`](../../web/app/school/sms/tabs.tsx#L4-L29); [`web/app/school/notices/notice-tabs.tsx`](../../web/app/school/notices/notice-tabs.tsx#L4-L29); [`web/app/school/questions/page.tsx`](../../web/app/school/questions/page.tsx#L13-L22); [`web/app/school/questions/page.tsx`](../../web/app/school/questions/page.tsx#L37-L50); [`web/app/school/questions/page.tsx`](../../web/app/school/questions/page.tsx#L52-L62) | In Finance & Communication, provide separate labelled entry cards/side-nav leaves for Fees, SMS, Notices, and Messages & Requests. Use the local tabs once the user enters one of those modules. Do not collapse the three communication journeys into one composer, one notification log, or a fee-receipt side effect. | 01 entry, 02 action, 03 review/outcome |
| 8 | Staff list and grant-editor routes redirect non-Owners to `/school`. The editor enumerates only `GRANTABLE_SCREENS`, loading individual `staff_permissions` rows and rendering a toggle for each. [`web/app/school/staff/page.tsx`](../../web/app/school/staff/page.tsx#L8-L17); [`web/app/school/staff/page.tsx`](../../web/app/school/staff/page.tsx#L31-L47); [`web/app/school/staff/[id]/page.tsx`](../../web/app/school/staff/[id]/page.tsx#L14-L31); [`web/app/school/staff/[id]/page.tsx`](../../web/app/school/staff/[id]/page.tsx#L42-L56) | Use a full-page Staff grant editor with the staff member’s name, individual existing screen toggles, and a clear return to Staff list. The review screen can summarize effective grants. Never introduce role templates, group permissions, Staff access to Staff, or a disabled Staff nav item for non-Owners. | 01 entry, 02 action, 03 review/outcome, 04 recovery |
| 9 | The shell carries Global Shift Selection and Global Academic Year Selection as context; it says the shift control is absent for a no-shift institute and the year control appears only when more than one started academic year exists. The attendance register receives both values as filter context. [`web/components/school-shell.tsx`](../../web/components/school-shell.tsx#L104-L114); [`web/app/school/attendance/mark/page.tsx`](../../web/app/school/attendance/mark/page.tsx#L41-L58) | Keep the global selectors in their current shell position and add a short Bangla scope cue near a screen’s local filter toolbar when it helps users understand why their list is narrowed. Never portray either selector as an authorization state. | 01 entry, 02 action, 04 recovery |
| 10 | Expired subscriptions replace all `/school/*` page content with `SubscriptionGate`; nearing expiry uses a dismissible banner instead. [`web/app/school/layout.tsx`](../../web/app/school/layout.tsx#L17-L21); [`web/app/school/layout.tsx`](../../web/app/school/layout.tsx#L51-L75) | Use a dedicated blocking recovery/gate screen for expiry. Do not reduce it to a normal dashboard KPI warning or present a false “continue working” action. | 04 recovery |

## Screen-generation constraints confirmed by the audit

- Use Bangla-only visible product labels in generated references. The current
  shell resolves labels through the selected `lang` before constructing nav
  items, so mixed-language labels would be a new UI convention rather than an
  existing product behaviour. [`web/components/school-shell.tsx`](../../web/components/school-shell.tsx#L48-L60);
  [`web/components/school-shell.tsx`](../../web/components/school-shell.tsx#L116-L127)
- Preserve current semantic visual states: the product already uses distinct
  mint, sun, and alert treatments alongside text labels for fee/exception
  status. Colour must reinforce, not replace, the state text. [`web/app/school/fees/page.tsx`](../../web/app/school/fees/page.tsx#L205-L223);
  [`web/app/school/questions/page.tsx`](../../web/app/school/questions/page.tsx#L87-L106)
- Keep route-backed module tabs visually reachable on mobile (the current tabs
  use no-wrap horizontal overflow), and do not add a competing mobile bottom
  navigation pattern. [`web/app/school/attendance/attendance-tabs.tsx`](../../web/app/school/attendance/attendance-tabs.tsx#L15-L31);
  [`web/app/school/sms/tabs.tsx`](../../web/app/school/sms/tabs.tsx#L13-L29)

## Implementation-ready handoff

Adopt Findings **1–10** in the remaining desktop and mobile Screen Sequence
references. Their priority order is: preserve gate/route correctness (1, 7,
8, 10), then make the daily task paths and recoveries explicit (2–6), then
clarify filter context without changing its meaning (9). The existing detailed
flowboards remain useful visual input; this audit supersedes any ambiguous
flowboard annotation that implies combined communication, disabled unauthorized
navigation, role templates, RFID/automation, a new payment, or bilingual
visible UI.

