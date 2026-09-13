# School Owner E2E flow UI patterns

Research note for the Stitch screen-sequence reference. This is a design
recommendation only: it does not alter routes, permissions, tokens, language
selection, or production code.

## Decision summary

Use a **grouped, route-preserving shell** plus **full-page primary workflows**.
The visual sidebar can help a School Owner understand the product, but it must
remain presentation only: the existing route and grant model is the authority.
Use tabs for sibling views *inside one module*, not as a replacement for primary
navigation. On mobile, retain the existing temporary drawer; do not introduce a
competing bottom navigation system.

For task work, use a full screen when the work is multi-step, creates a record,
changes institutional data, or needs review. Use a small modal only for a
short, interruptive confirmation or acknowledgement. Use a contextual side panel
only to inspect, filter, or take a small reversible action while preserving the
list context. These are recommendations for future screen references, not
claims about an existing component implementation.

## Product evidence: preserve this surface

The school sidebar currently exposes Dashboard, Students, Employees, Classes,
Attendance, Exams, Fees, SMS, Notices, Messages & Requests, Institute, and Staff.
Attendance is the only declared child; its route and own permission are retained
even though the current shell flattens the child visually. The proposed five
groups—Overview, People, Academics, Finance & Communication, and
Administration—must therefore be labels around the existing destinations, never
new routes or permission boundaries. See
[school-nav.ts](../../web/lib/school-nav.ts) and
[school-shell.tsx](../../web/components/school-shell.tsx).

The screen registry makes the boundary explicit: grant-gated modules, owner-only
Staff, and member screens (including Dashboard, Questions, and Corrections) have
different access rules. A screen sequence must hide unavailable destinations and
actions rather than render them as disabled UI. See
[screens.ts](../../web/lib/auth/screens.ts).

The existing shell already provides a desktop collapsible rail, a mobile temporary
drawer, feature-aware search, language and theme controls, notifications, and
44px minimum navigation/primary-control heights. It closes the drawer after a
navigation action. Keep those behaviors in the references; they are already
compatible with WCAG's 24-by-24 CSS-pixel minimum pointer target requirement.
See [app-shell.tsx](../../web/components/app-shell.tsx) and
[W3C WCAG 2.2 Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).

The product's search index already knows both broad modules and intent-level
destinations—new admission, new employee, attendance, fee collection, new
notice, questions, corrections, and response performance. It is the escape hatch
for a user who knows a task but not its sidebar location; the grouped sidebar
should complement it rather than duplicate it. See
[school-search.ts](../../web/lib/school-search.ts).

The current journey surface includes real sub-routes: admission and student
records; employee records; class, attendance, and exams; fee collection and
accounting; SMS and notices; the Questions/Corrections/Response hub; and
institution/staff administration. The page tree is under
[`web/app/school`](../../web/app/school). Representative task pages show a
class/date attendance register with differentiated empty states, a filtered fee
roster with the selected collection record and receipt link, and a notice form
that progressively reveals the current-year class audience. See
[attendance/mark/page.tsx](../../web/app/school/attendance/mark/page.tsx),
[fees/page.tsx](../../web/app/school/fees/page.tsx), and
[notices/new/page.tsx](../../web/app/school/notices/new/page.tsx).

## Pattern decisions for the references

### 1. Grouped navigation, then contextual tabs

Use the sidebar for destination hierarchy and use tabs only where the user is
already inside a module and the views share one subject, context, and route
family. Examples from the current product include Attendance, Accounting, and
Notice tabs. Do not make “Students / Fees / SMS / Notices” tabs: that conceals
the application-wide information architecture and does not fit a mobile screen.

For the target visual rail:

| Visual group | Preserve these destinations | Expanded state in a sequence |
| --- | --- | --- |
| Overview | Dashboard | Overview always visible; Dashboard active. |
| People | Students, Employees | People expanded for admission, directory, and staff flows. |
| Academics | Classes, Attendance, Exams | Academics expanded; Attendance stays visually subordinate to Classes where useful. |
| Finance & Communication | Fees, SMS, Notices, Messages & Requests | Expand only for a journey in this group. |
| Administration | Institute, Staff | Staff appears only to the School Owner. |

This is within the intended use of side navigation: a hierarchy of one to three
levels, short labels, a visible current page, and tested depth/breadth. The
source also warns that a hierarchy that is too long or deep hides choices, so
each group should contain links to module homes—not every deep route.
[USWDS side navigation](https://designsystem.digital.gov/components/side-navigation/).

On desktop, keep Overview and the current group expanded; collapse unrelated
groups. On mobile, the drawer is closed on arrival and opens with the current
group expanded. Each disclosure must be a labeled button with `aria-expanded`
and `aria-controls`, a large hit target, and no nested interactive control in its
header. This uses the documented disclosure/accordion behavior; accordions are
appropriate for a few selectively needed sections, but not for information that
must be compared all at once.
[W3C Disclosure Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/),
[USWDS accordion](https://designsystem.digital.gov/components/accordion/).

### 2. Page, panel, modal, and tab decision rule

| UI surface | Use in the School Owner journeys | Do not use it for |
| --- | --- | --- |
| **Full page** | Admission, employee creation/edit, class configuration, attendance marking, exam setup/marks/publish, fee collection review, SMS or notice composition, institution settings, staff permissions. Include page title, context/breadcrumb, clear primary action, and review or outcome. | A one-choice confirmation. |
| **Contextual side panel** | Directory-record preview, filters, a compact fee detail that preserves the roster, or an activity/notification preview. Keep the current list query in the URL and provide a full-page “Open” action. | A long form, a multi-step task, or a dense table the user must read. |
| **Modal** | Destructive/irreversible confirmation, unsaved-work warning, a short acknowledgement, or a small decision directly related to the current step. Use explicit primary and cancel actions. | Multi-step admission, permission setup, marks entry, long content, or field validation. |
| **Tabs** | Sibling views within one module, such as collection/ledger/structures or questions/corrections/response. Keep the current tab in the URL or a direct destination so it is shareable/searchable. | Global navigation or a stepper for a linear transaction. |

Modals intentionally make page content inert. W3C requires focus to enter the
dialog, stay within it while open, and return to a logical workflow point when it
closes; Escape and a visible close/cancel control are expected. USWDS explicitly
advises avoiding complex/multi-step modal flows. That makes a confirmation modal
appropriate after the user has filled a full page, not a replacement for the
page. [W3C modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
[USWDS modal](https://designsystem.digital.gov/components/modal/).

Tabs are composite controls with specific arrow-key interaction and a separate
active panel. Use them only where switching is lateral rather than sequential;
otherwise a step indicator plus separate screens is clearer.
[W3C tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).

### 3. Form structure and progressive disclosure

Use **one primary decision per screen**. Place the most commonly required fields
first, group related fields under Bangla headings, and reveal dependent fields
only after the prerequisite is chosen—for example, target class only after Notice
audience is not “all”, matching the current notice form. Keep a visible draft or
“saved” status for longer forms, but do not confuse it with final submission.

For a small-to-medium transaction (such as admission), use:

1. entry/orientation with context and required fields;
2. action/edit in sections, with a compact progress indicator only if the form
   genuinely needs multiple screens;
3. review/check answers before the irreversible create/publish action; and
4. confirmation with a record reference and a next task.

A check-answers screen gives people a chance to correct details before final
submission and is recommended immediately before confirmation for a small or
medium transaction. [GOV.UK check answers](https://design-system.service.gov.uk/patterns/check-answers/).

Keep long-form detail on a full page; disclosure is for optional helper content,
advanced filters, or a few rarely used settings—not required data. This matters
for Bangla copy, whose label lengths may change at runtime when the user switches
language. Do not use placeholders as labels; retain explicit persistent labels.

### 4. Validation, recovery, and outcomes

On submit or “continue”, retain all supplied values, give a concise error summary
at the top that receives focus, and repeat the same actionable Bangla error next
to each affected input. Do not use a field error for a problem the person cannot
fix, such as an unavailable service or unavailable permission: show an
interruption/permission state with an appropriate next step instead. Avoid
premature validation while somebody is still entering a field, except for
non-blocking requirement feedback where it materially prevents a mistake.
[GOV.UK validation recovery](https://design-system.service.gov.uk/patterns/validation/),
[GOV.UK error summary](https://design-system.service.gov.uk/components/error-summary/),
[W3C form notifications](https://www.w3.org/WAI/tutorials/forms/notifications/).

Show a confirmation **screen** after a created admission, published result or
notice, submitted permission change, or comparable transaction. Include what
happened, the record/receipt reference when one exists, and a clear continuation:
“view record”, “do the next task”, or “return to list”. Use a transient toast
only for a reversible, local save and pair it with a durable in-page state so the
outcome does not disappear. [GOV.UK confirmation pages](https://design-system.service.gov.uk/patterns/confirmation-pages/).

Every sequence must contain a realistic recovery state. Prefer the product’s
actual constraints over generic failures: no students in the selected class;
duplicate fee record to edit instead of creating another; no eligible audience;
low/empty SMS credit; an owner-only Staff destination; missing prerequisite class
or exam configuration; or a validation error with values preserved.

### 5. Dense operational data

Keep directories, registers, accounting records, and marks in true tables when
the rows share consistent columns. Use a compact, labeled filter/action toolbar,
short headers, sortable data only when sorting is useful, a visible selected row,
and explicit row actions such as “Open”, “Collect”, or “Edit”. Do not make a
whole dense row a mystery click target.

On mobile, choose deliberately: horizontally scroll a numeric, multi-column
table (with keyboard-focusable scroll container) or stack a directory row as a
record card. Reduce columns before shrinking text; preserve the identifying row
label, state, and action. USWDS recommends horizontal scrolling for dense numeric
tables and a stacked layout for directories, while keeping columns few and
headers short. [USWDS table](https://designsystem.digital.gov/components/table/).

Where several related actions remain visible, label the cluster as a toolbar and
use a predictable keyboard model. Do not force keyboard users to tab through a
large control cluster one button at a time. [W3C toolbar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/).

### 6. Bangla-first and accessibility invariants

- Render one selected UI language at a time. Use Bangla-only end-user copy in
  the reference images; do not add English translations inside controls.
- Keep text labels with icons and semantic color; never make color alone report
  an error, approval, or payment state.
- Preserve at least the current 44px control height and clear focus styling.
  WCAG 2.2 sets 24×24 CSS pixels as the minimum pointer target; the current shell
  already exceeds that for navigation and primary controls.
- In a modal or mobile drawer, move focus inside when it opens, provide an
  obvious close, support Escape, and return focus to the invoking control.
- Ensure a page still reads in a single logical order if content reflows. Do not
  hide required information behind horizontal gestures alone.

## Apply to the screen sequences (priority order)

1. **People — admission:** Student Directory → New Admission full page → Check
   answers → Admission confirmation; recovery is invalid/missing field or a
   duplicate identifier. Desktop and mobile retain the People group and
   `/school/students/new` route.
2. **Academics — attendance:** Class/Attendance home → class/date register →
   saved review → no-students/no-class or correction state. Keep class/year/shift
   context visible; make the roster a table on desktop and a deliberately chosen
   scroll/stack form on mobile.
3. **Finance — collection:** Fee collection filters/roster → selected learner’s
   collection panel or full page → receipt/updated-record outcome → existing
   record or no-students recovery. Retain the present query-driven selection
   route rather than inventing another record identity.
4. **Communication — send/publish:** SMS or Notice module → compose full page
   with conditional audience fields → review/confirmation → low-credit or
   blocked/no-eligible-audience recovery. Use tabs only for the module’s sibling
   inbox/log/settings views.
5. **Administration — protected change:** Institute or Staff page → scoped
   edit/permission action → review/save confirmation → owner-only or unsaved
   changes recovery. Staff must never see an actionable Staff-permissions control.
6. **Overview — triage:** Dashboard → direct exception destination → resolved
   status/“all caught up” result → a blocking subscription/credit/missing-data
   recovery. This is the entry into the other journeys, not a duplicate module
   directory.

## Source quality and limits

The route and permission claims above come from the repository paths cited in
each section. Pattern guidance comes from W3C WAI, the U.S. Web Design System,
and the GOV.UK Design System—the organizations that publish the referenced
standards/components. The recommendations are deliberately adapted to this
Bangla-first, desktop-and-mobile School Owner portal; they are not a claim that
any source has tested this exact product. Validate the eventual interactions with
School Owners and Staff Users before changing production UI.
