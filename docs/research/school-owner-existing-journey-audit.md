# School Owner Existing Journey Audit

## Purpose and method

This is a source audit of the current `/school/*` product for the **School
Owner**. It is a handoff for the still-unbuilt desktop and mobile Screen
Sequences. It distinguishes current behaviour from proposed visual treatment:
the five sidebar groups in the redesign are a **presentation layer**, not a
new navigation, authorization, feature, or route model.

All route, screen, submenu, and action claims below were checked directly in
the repository on 2026-09-13. The terminology is cross-validated against
[`CONTEXT.md`](../../CONTEXT.md):

- Use **School Owner**, not “admin” or “principal”, for the School’s primary
  full-access account.
- Use **Staff User**, not “employee login” or “sub-user”, for a restricted
  school member. An Employee record and a Staff User are not interchangeable.
- A **Permission Grant** is a Staff User’s grant to a specific grantable
  Screen; it is not a visual toggle or a section-level permission.
- A **Class Catalogue** contains **Class Offerings**. A Class Offering’s
  identity includes its Academic Year and may include group and shift; flows
  must not reduce it to a bare class/section pair.
- A **Fee Collection Record** is the cumulative fee state for one Student and
  month. It is not an append-only payment or transaction history.

## 1. Route, screen, action, and submenu matrix

### Current navigation truth

The sidebar source is `SCHOOL_MODULES` in
[`web/lib/school-nav.ts`](../../web/lib/school-nav.ts). The only authored child
is **Attendance** under **Classes**. `SchoolShell` currently walks each parent
then child into one visible flat list, so this hierarchy is not currently
rendered as an expanded/collapsible sidebar tree
([`web/components/school-shell.tsx`](../../web/components/school-shell.tsx)).

| Proposed visual group | Current route / Screen gate | Screen and current actions | Current local submenu or direct child route | Evidence |
|---|---|---|---|---|
| Overview | `/school` — `dashboard`, member | KPI tiles; conditional Messages & Requests backlog; Daily Checklist; Upcoming Activity; grant-filtered quick actions for New Student Admission, New Employee, Mark Attendance, Collect Fee, and New Notice; School Owner also sees Approvals. A Class Teacher conditionally gets My Classes. | `/school/activity`, `/school/approvals`, `/school/profile`, `/school/my-classes` are member screens, not persistent sidebar entries. | [`web/app/school/page.tsx`](../../web/app/school/page.tsx), [`web/lib/school-nav.ts`](../../web/lib/school-nav.ts), [`web/lib/auth/screens.ts`](../../web/lib/auth/screens.ts) |
| People → Students | `/school/students` — `students`, grant | Search/filter roster; Old Students; School Owner-only bulk Student Login; New Student Admission; each row opens a Student record. | `/school/students/new`; `/school/students/[id]`; `/school/students/[id]/transfer`; print admission and ID Card; `/archive`; `/logins`; `/subject-assignment`. | [`web/app/school/students/page.tsx`](../../web/app/school/students/page.tsx), [`web/app/school/students/new/page.tsx`](../../web/app/school/students/new/page.tsx), [`web/app/school/students/[id]/page.tsx`](../../web/app/school/students/[id]/page.tsx) |
| People → Employees | `/school/employees` — `employees`, grant | Employee list and New Employee action; row opens an Employee profile. | `/school/employees/new`; `/school/employees/[id]`; `/school/employees/archive`. | [`web/app/school/employees/page.tsx`](../../web/app/school/employees/page.tsx), [`web/app/school/employees/new/page.tsx`](../../web/app/school/employees/new/page.tsx), [`web/app/school/employees/[id]/page.tsx`](../../web/app/school/employees/[id]/page.tsx) |
| Academic operations → Class Catalogue | `/school/classes` — `classes`, grant | Browse and manage Class Offerings; class controls and class-teacher assignment are contextual actions. | `/school/classes/routine` and print; `/school/classes/syllabus`. | [`web/app/school/classes/page.tsx`](../../web/app/school/classes/page.tsx), [`web/app/school/classes/routine/page.tsx`](../../web/app/school/classes/routine/page.tsx), [`web/app/school/classes/syllabus/page.tsx`](../../web/app/school/classes/syllabus/page.tsx) |
| Academic operations → Attendance | `/school/attendance` — `attendance`, grant | The index deliberately redirects to Mark Attendance; marking uses Class Offering/date filters and a register form. | Tab strip: `/mark`, `/book`, `/employee`, `/student-log`, `/leave`, `/off-days`. | [`web/app/school/attendance/page.tsx`](../../web/app/school/attendance/page.tsx), [`web/app/school/attendance/attendance-tabs.tsx`](../../web/app/school/attendance/attendance-tabs.tsx), [`web/app/school/attendance/mark/page.tsx`](../../web/app/school/attendance/mark/page.tsx) |
| Academic operations → Exams & Results | `/school/exams` — `exams`, grant | Create a light new Exam then use the Exam list to open the specific Exam’s setup. Setup owns basic information, grading scheme, subject/teacher assignment, and results publishing state. | Module tabs: `/grading-schemes`, `/combinations`, `/cocurricular-items`, `/result-inquiry`. Per-exam routes include routine, seat plan, attendance sheet, marks entry, result book, admit cards, printables, progress report, mark sheet, promotion, and co-curricular entry. | [`web/app/school/exams/page.tsx`](../../web/app/school/exams/page.tsx), [`web/app/school/exams/exams-tabs.tsx`](../../web/app/school/exams/exams-tabs.tsx), [`web/app/school/exams/[id]/page.tsx`](../../web/app/school/exams/[id]/page.tsx) |
| Academic operations → My Classes | `/school/my-classes` — `my-classes`, member | This is a conditional work surface for a Class Teacher, not a permission-grant module or sidebar destination. Tasks open an individual roster/review route. | `/school/my-classes/tasks/[id]`. | [`web/app/school/page.tsx`](../../web/app/school/page.tsx), [`web/app/school/my-classes/page.tsx`](../../web/app/school/my-classes/page.tsx), [`web/app/school/my-classes/tasks/[id]/page.tsx`](../../web/app/school/my-classes/tasks/[id]/page.tsx) |
| Finance & communication → Fees | `/school/fees` — `fees`, grant | Class/month/year selection, Student roster, Collect or Edit Fee Collection Record, recent records, and receipt link. | Tab strip: `/structures`, `/` (collection), `/vouchers`, `/assets`, `/bank`, `/director-capital`, `/ledger`; receipt and voucher detail routes. | [`web/app/school/fees/page.tsx`](../../web/app/school/fees/page.tsx), [`web/app/school/fees/accounting-tabs.tsx`](../../web/app/school/fees/accounting-tabs.tsx), [`web/app/school/fees/structures/page.tsx`](../../web/app/school/fees/structures/page.tsx) |
| Finance & communication → SMS | `/school/sms` — `sms`, grant | SMS composition is the entry screen; school SMS credit is exposed in the shell when available. | `/school/sms/buy`, `/school/sms/log`, `/school/sms/rules`. | [`web/app/school/sms/page.tsx`](../../web/app/school/sms/page.tsx), [`web/app/school/sms/tabs.tsx`](../../web/app/school/sms/tabs.tsx), [`web/app/school/sms/buy/page.tsx`](../../web/app/school/sms/buy/page.tsx) |
| Finance & communication → Notices | `/school/notices` — `notices`, grant | Notice list and New Notice; individual notice detail includes context-specific controls. | `/school/notices/new`; `/school/notices/[id]`; gallery and album detail routes. | [`web/app/school/notices/page.tsx`](../../web/app/school/notices/page.tsx), [`web/app/school/notices/notice-tabs.tsx`](../../web/app/school/notices/notice-tabs.tsx), [`web/app/school/notices/new/page.tsx`](../../web/app/school/notices/new/page.tsx) |
| Finance & communication → Messages & Requests | `/school/questions`, `/school/corrections`, `/school/questions/response` — member | The hub is a sidebar item using the always-available `dashboard` sentinel. Questions are grouped by topic and show reply capability only where the caller may reply. Corrections are visible according to RLS; only School Owner can apply/reject a pending correction. | `HubTabs` link Questions, Corrections, and Response Performance. Search also has separate direct entries for all three. | [`web/lib/school-nav.ts`](../../web/lib/school-nav.ts), [`web/lib/school-search.ts`](../../web/lib/school-search.ts), [`web/app/school/questions/page.tsx`](../../web/app/school/questions/page.tsx), [`web/app/school/corrections/page.tsx`](../../web/app/school/corrections/page.tsx) |
| Finance & communication → Guardian Feedback | `/school/feedback` — `feedback`, grant | Feedback inbox and ratings screens still exist. | `/school/feedback/ratings`. It is deliberately hidden from both sidebar and feature search; do not make it a default visible group destination in reference screens. | [`web/lib/school-nav.ts`](../../web/lib/school-nav.ts), [`web/lib/school-search.ts`](../../web/lib/school-search.ts), [`web/app/school/feedback/page.tsx`](../../web/app/school/feedback/page.tsx) |
| Administration → Institute | `/school/institute` — `institute`, grant | Institution profile/settings. It also carries the day-to-day setup surfaces. | Institute tabs and routes: venues, templates and template types, logistics, and daily-checklist setup. | [`web/app/school/institute/page.tsx`](../../web/app/school/institute/page.tsx), [`web/app/school/institute/tabs.tsx`](../../web/app/school/institute/tabs.tsx), [`web/app/school/institute/checklist/page.tsx`](../../web/app/school/institute/checklist/page.tsx), [`web/app/school/institute/templates/page.tsx`](../../web/app/school/institute/templates/page.tsx) |
| Administration → Staff | `/school/staff` — `staff`, owner | School Owner can create/list Staff Users and open a Staff User’s screen-grant editor. The editor enumerates only `GRANTABLE_SCREENS`, not member or owner-only screens. | `/school/staff/[id]`. | [`web/app/school/staff/page.tsx`](../../web/app/school/staff/page.tsx), [`web/app/school/staff/[id]/page.tsx`](../../web/app/school/staff/[id]/page.tsx), [`web/lib/auth/screens.ts`](../../web/lib/auth/screens.ts) |
| Administration → Approvals | `/school/approvals` — `approvals`, member | In-progress workflow instances; the current stage’s approver decides through the existing controls. The dashboard action is currently shown only to School Owner. | No local navigation strip. | [`web/app/school/approvals/page.tsx`](../../web/app/school/approvals/page.tsx), [`web/app/school/page.tsx`](../../web/app/school/page.tsx) |

## 2. Navigation and permission constraints

### Screen identities and gates are non-negotiable

The Screen registry uses the first segment beneath `/school` as the authorization
identity. Its permitted answers are `grant`, `owner`, and `member`; a route
whose first segment is missing from the registry is rejected rather than being
silently open. Nested paths therefore inherit their top-level Screen identity
([`web/lib/auth/screens.ts`](../../web/lib/auth/screens.ts)).

| Caller | Current access rule | Reference-screen implication |
|---|---|---|
| School Owner | `canOpenScreen` returns true for every registered School screen. | Show the whole authorized module set, but retain contextual rather than duplicated actions. |
| Staff User | A grant Screen requires the corresponding Permission Grant; member Screens remain open; owner Screens remain unavailable. | Do not show disabled Owner controls as decorative UI. Omit Staff and owner-only Student Login actions. |
| Any school member | Member Screens open, but their data/actions are further scoped through RLS or domain checks. | Messages & Requests must not be treated as a “grant-free all-school inbox”; the contents differ by caller. |
| Feature-disabled School | The layout loads enabled features and `SchoolShell` removes disabled grantable modules from the sidebar. | The same module must disappear from grouped navigation, More Features, quick actions, and search references. It must not appear as a disabled navigation item. |
| Expired School | `/school` content is replaced by `SubscriptionGate`; near expiry can render a subscription banner. | Model the blocking subscription state as a full recovery/gate screen, not as a normal KPI warning. |

Sources: [`web/lib/auth/screens.ts`](../../web/lib/auth/screens.ts),
[`web/components/school-shell.tsx`](../../web/components/school-shell.tsx), and
[`web/app/school/layout.tsx`](../../web/app/school/layout.tsx).

### Current navigation layers

1. **Global sidebar:** Dashboard plus `SCHOOL_MODULES`. The data shape contains
   only one authored child relationship, Classes → Attendance. The current shell
   flattens it in visible order. A five-group sidebar can be designed, but it
   must map back to these same destinations and current authorization checks.
2. **Module-local tabs:** Attendance, Exams, Fees, SMS, Notices, and Institute
   already have route-based tab strips. These are the right existing pattern for
   sibling workflows; no new top-level sidebar rows are required.
3. **Contextual links:** list row actions open records, forms, print views,
   archival, transfer, and similar deep tasks. Keep these contextual rather
   than promoting them into sidebar submenus.
4. **Global search:** the command palette has direct feature destinations and
   uses `canOpenScreen` filtering. It intentionally separates the Messages &
   Requests tabs as individual searchable intents.
5. **Dashboard actions:** quick actions are the official direct routes in
   `SCHOOL_QUICK_ACTIONS`. They are grant-filtered before render.

Sources: [`web/lib/school-nav.ts`](../../web/lib/school-nav.ts),
[`web/components/school-shell.tsx`](../../web/components/school-shell.tsx),
[`web/lib/school-search.ts`](../../web/lib/school-search.ts),
[`web/app/school/page.tsx`](../../web/app/school/page.tsx).

### Context filters are not authorization

The shell carries Global Shift Selection and Global Academic Year Selection as
per-user view preferences. The active Academic Year is a forward-only School
cursor; the global selection narrows specific browse/management surfaces and is
not a substitute for a Permission Grant. In the Screen Sequences, preserve the
selectors and explain their scope near a picker/filter rather than presenting
them as an access state. This terminology and boundary comes from
[`CONTEXT.md`](../../CONTEXT.md) and the values passed through
[`web/app/school/layout.tsx`](../../web/app/school/layout.tsx) into
[`web/components/school-shell.tsx`](../../web/components/school-shell.tsx).

## 3. Likely end-to-end School Owner journeys

These are source-grounded likely journeys, not an assertion that every route is
currently presented as a guided wizard.

### A. Daily operations and exception resolution

`/school` → inspect conditional backlog, attendance/subscription status, and
checklist → use an existing quick action or direct link → return to a module
state that visibly reflects the result.

The dashboard already suppresses the Messages & Requests card when there is no
backlog, shows My Classes only when the caller is attached as a class teacher,
and filters quick actions by access. A redesign should retain those conditional
rules, then add a compact “all caught up” review state when no exception is
present. Source: [`web/app/school/page.tsx`](../../web/app/school/page.tsx).

### B. Admit and maintain a Student

`/school/students` → filter/search the roster or choose **New Student
Admission** → `/school/students/new` → save the admission form →
`/school/students/[id]` to review/edit the Student, print admission/ID Card,
transfer, archive, manage subject assignment, or manage the owner-only Student
login.

Important recovery states already distinguished by the list/register model:

- no Class Offering assigned to the Staff User is not the same as no Students;
- a filter with no match offers **Clear filters**, not admission;
- no Students offers New Student Admission.

Do not make the Student’s class label a generic class/section pair. The list
and form carry the Class Catalogue label and current selection rules. Sources:
[`web/app/school/students/page.tsx`](../../web/app/school/students/page.tsx),
[`web/app/school/students/new/page.tsx`](../../web/app/school/students/new/page.tsx),
[`web/app/school/students/[id]/page.tsx`](../../web/app/school/students/[id]/page.tsx),
[`CONTEXT.md`](../../CONTEXT.md).

### C. Record and verify attendance

Dashboard **Mark Attendance** → `/school/attendance` → redirect to
`/school/attendance/mark` → choose a Class Offering and date → mark the
register → review in Attendance Book or Student Log; use the module tab strip
to reach employee attendance, leave, and off-days where needed.

The recovery branch must preserve the three distinct empty states in the mark
screen: unassigned Staff User, no Students in the selected Class Offering, and
no match. RFID/automatic attendance is explicitly disabled, so flows should not
teach a model to invent an RFID card-assignment step. Sources:
[`web/app/school/attendance/page.tsx`](../../web/app/school/attendance/page.tsx),
[`web/app/school/attendance/attendance-tabs.tsx`](../../web/app/school/attendance/attendance-tabs.tsx),
[`web/app/school/attendance/mark/page.tsx`](../../web/app/school/attendance/mark/page.tsx).

### D. Configure, run, and publish an Exam

`/school/exams` → add a light Exam record → open `/school/exams/[id]` → enter
basic information, attach a grading scheme, and assign subject teachers → use
the Exam header for the configured workflow surfaces (routine, seat plan,
attendance, marks, results, printables) → publish results when the existing
preconditions permit.

Exam setup controls are disabled after the Exam is closed. Review and recovery
screens should visibly explain that locked state and direct the user to the
current allowed next step instead of showing editable-looking form fields.
Sources: [`web/app/school/exams/page.tsx`](../../web/app/school/exams/page.tsx),
[`web/app/school/exams/[id]/page.tsx`](../../web/app/school/exams/[id]/page.tsx),
[`web/app/school/exams/exams-tabs.tsx`](../../web/app/school/exams/exams-tabs.tsx).

### E. Collect and review fees

Dashboard **Collect Fee** → `/school/fees` → choose Class Offering, month, and
year → select a Student row → collect or edit that Student’s Fee Collection
Record → review the recent-record status and open `/school/fees/receipt/[id]`
when a receipt is required.

The same Student/month opens an edit path and a duplicate-record notice rather
than a second payment line. The sequence must teach this domain behaviour and
must retain a “choose a class” and “no Students in this class” state. Sources:
[`web/app/school/fees/page.tsx`](../../web/app/school/fees/page.tsx),
[`web/app/school/fees/accounting-tabs.tsx`](../../web/app/school/fees/accounting-tabs.tsx),
[`CONTEXT.md`](../../CONTEXT.md).

### F. Publish a Notice or send SMS; close the request loop

For communication, the School Owner has three distinct journeys:

- `/school/notices` → `/school/notices/new` → publish → notice detail/gallery;
- `/school/sms` compose → use SMS module tabs for purchase, log, and rules;
- Messages & Requests → Questions or Corrections tab → reply, or (School Owner
  only) apply/reject a pending correction → the card becomes resolved.

Do not combine these as a fictional single “message” screen. SMS, Notices, and
the RLS-scoped Messages & Requests hub have different routes, data, and
consequences. Sources: [`web/app/school/notices/page.tsx`](../../web/app/school/notices/page.tsx),
[`web/app/school/notices/new/page.tsx`](../../web/app/school/notices/new/page.tsx),
[`web/app/school/sms/page.tsx`](../../web/app/school/sms/page.tsx),
[`web/app/school/sms/tabs.tsx`](../../web/app/school/sms/tabs.tsx),
[`web/app/school/questions/page.tsx`](../../web/app/school/questions/page.tsx),
[`web/app/school/corrections/page.tsx`](../../web/app/school/corrections/page.tsx).

### G. Configure the School and delegate safely

`/school/institute` → choose profile, venues, templates, logistics, or
checklist setup → save and review the active configuration. For delegation,
`/school/staff` → create/select a Staff User → `/school/staff/[id]` → toggle
only the current grantable Screens → review the effective list of grants.

Use `/school/approvals` to decide a workflow instance only when the current
stage identifies the caller as its approver. Do not represent all School Owners
or all Staff Users as eligible approvers. Sources:
[`web/app/school/institute/tabs.tsx`](../../web/app/school/institute/tabs.tsx),
[`web/app/school/staff/[id]/page.tsx`](../../web/app/school/staff/[id]/page.tsx),
[`web/app/school/approvals/page.tsx`](../../web/app/school/approvals/page.tsx).

## 4. UI/UX improvements that preserve the product contract

| Opportunity | Recommended UI treatment | Guardrail preserved by the reference screens |
|---|---|---|
| Find an authorized module quickly | Present the existing destinations in the five visual groups: Overview; People; Academic operations; Finance & communication; Administration. Expand Overview and the current group; keep other groups collapsed on mobile. | Group labels are presentation only. Each row still uses its present route, Screen identity, feature switch, and Permission Grant. |
| Reach a deep operation without bloating the sidebar | Retain module-local tab strips for peer tasks; use contextual `Open`, `New`, `Print`, `Transfer`, or `Collect` actions in page headers/rows. | Deep routes remain contextual. Do not turn `/new`, `/archive`, print pages, or record detail routes into globally visible module permissions. |
| Make daily work obvious | Use the dashboard’s existing quick-action routes as a primary action cluster. Add a conditional full-width Needs Attention band; replace it with a compact all-caught-up status only when no exception exists. | Use current sources of truth: subscription state, attendance state, hub backlog, SMS credit, and owner-only approvals. Do not create an unverified aggregate task system. |
| Clarify local sibling workflows | Keep the current route-based tabs for Attendance, Exams, Fees, SMS, Notices, and Institute. On mobile, keep tab labels horizontally reachable and expose the active tab clearly. | Tabs are route links, not a client-only state that loses refresh/deep-link behavior. |
| Reduce multi-step cognitive load | Use a visible step indicator on high-effort forms such as Student Admission, Exam Setup, or a fee collection sequence; preserve Save/Cancel actions and show a review summary after submission. | The indicator is visual guidance only. It must not split an existing route into new Screens or bypass server validation. |
| Make destructive or irreversible decisions deliberate | Use a confirmation dialog for archive, reject/apply correction, workflow decision, or publish/close operations. In the reference, state the affected record and the consequence; after success, return to the normal route-backed review state. | The dialog calls the same existing action; it never substitutes a newly invented approval role, route, or permission. |
| Keep filters comprehensible | Put Class Offering, date, month/year, and status filters in a compact toolbar. Preserve a visible “clear filters” recovery route for no-match states. | Keep Class Catalogue labels, Global Shift Selection, and Global Academic Year Selection semantics; do not treat a filter as authorization. |
| Improve responsive review | Use desktop tables where comparison matters; on mobile turn each row into a compact card with an explicit text action. Keep the meaningful action accessible without horizontal page scrolling. | Preserve list/detail URLs and all table data; do not remove information to make mobile look clean. |
| Surface ownership boundaries | Label unavailable owner-only actions by omission for Staff Users. Where a member can see but not act (e.g. correction review), show a concise explanation in the content state. | Avoid disabled navigation or fake permissions; this matches current `canOpenScreen` and RLS boundaries. |
| Preserve language and token continuity | Use the established selected-language UI (Bangla when Bangla is selected), semantic brand/mint/sun/alert states, existing responsive shell, and current visual tokens. | No new palette, bilingual-in-one-label pattern, route rename, or alternate product vocabulary. |

## 5. Recommendations to incorporate into the Screen Sequences

The following should be incorporated into the planned **Entry → Primary Action
→ Review/Success → Recovery** screen sequence for both desktop and mobile. The
word “recommended” marks visual flow guidance; paths and constraints are current
source facts.

| Visual group | Entry screen | Primary action screen | Review/success screen | Recovery branch that must be shown |
|---|---|---|---|---|
| Overview | Action-first `/school` dashboard with current group expanded and conditional Needs Attention. | Launch one of the existing quick actions or open the conditional Messages & Requests item. | Updated checklist/exception state or compact all-caught-up state. | Subscription expired is a blocking gate; no hub backlog must not render an empty alert card. |
| People | `/school/students` list with scoped filter/search and explicit New Student Admission. | `/school/students/new` form, using Class Offering labels. | `/school/students/[id]` with profile, print, transfer, archive, and contextual next actions. | No-match → Clear filters; no Students → New Admission; unassigned Staff User → explanation/back, not admission. |
| Academic operations | `/school/attendance/mark` reached through Classes → Attendance or dashboard action. | Class Offering/date register with bulk/per-student marking. | Attendance Book/Student Log review, with the active Attendance tab obvious. | Manual-only attendance; show unassigned, no Students, and no-match states separately. A later Exam sequence should show the locked/closed setup state. |
| Finance & communication | `/school/fees` collection list with active Fees tab and visible Class/month/year filter context. | Select a Student and edit/collect the Fee Collection Record inline at `#collect-form`. | Record status plus receipt route; a separate communication sequence can use Notice detail or SMS log. | Existing record → edit plus duplicate-record explanation, never “new payment”; no selected Class/empty roster must have its own state. |
| Administration | `/school/staff` list and `/school/institute` settings entry represented as separate, grouped destinations. | Open `/school/staff/[id]` and change only grantable Screen toggles; settings forms stay on their existing Institute routes. | Effective Permission Grant review with a clear return to Staff list; use Approvals only for instances the current caller may decide. | Non-owner reaches owner-only Staff route → current redirect/denial behaviour. No fictional “role template” or group-level permission control. |

## Source index

- [`CONTEXT.md`](../../CONTEXT.md)
- [`web/lib/school-nav.ts`](../../web/lib/school-nav.ts)
- [`web/lib/school-search.ts`](../../web/lib/school-search.ts)
- [`web/lib/auth/screens.ts`](../../web/lib/auth/screens.ts)
- [`web/components/school-shell.tsx`](../../web/components/school-shell.tsx)
- [`web/app/school/layout.tsx`](../../web/app/school/layout.tsx)
- [`web/app/school/page.tsx`](../../web/app/school/page.tsx)
- [`web/app/school/students/page.tsx`](../../web/app/school/students/page.tsx)
- [`web/app/school/students/new/page.tsx`](../../web/app/school/students/new/page.tsx)
- [`web/app/school/students/[id]/page.tsx`](../../web/app/school/students/[id]/page.tsx)
- [`web/app/school/attendance/attendance-tabs.tsx`](../../web/app/school/attendance/attendance-tabs.tsx)
- [`web/app/school/attendance/mark/page.tsx`](../../web/app/school/attendance/mark/page.tsx)
- [`web/app/school/exams/exams-tabs.tsx`](../../web/app/school/exams/exams-tabs.tsx)
- [`web/app/school/exams/[id]/page.tsx`](../../web/app/school/exams/[id]/page.tsx)
- [`web/app/school/fees/accounting-tabs.tsx`](../../web/app/school/fees/accounting-tabs.tsx)
- [`web/app/school/fees/page.tsx`](../../web/app/school/fees/page.tsx)
- [`web/app/school/questions/page.tsx`](../../web/app/school/questions/page.tsx)
- [`web/app/school/corrections/page.tsx`](../../web/app/school/corrections/page.tsx)
- [`web/app/school/staff/[id]/page.tsx`](../../web/app/school/staff/[id]/page.tsx)
