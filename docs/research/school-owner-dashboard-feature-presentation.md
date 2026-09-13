# School-owner dashboard — feature presentation research

Research note for the Stitch redesign. Research only; no product code or Stitch
project is changed by this note.

## Verdict up front

Use an **action-first dashboard with hub-and-spoke navigation**:

- Keep the persistent school shell as the spoke index: a grouped left rail on
  desktop, a temporary drawer on mobile, and the existing feature-aware search.
- Make the first viewport answer three questions: “What needs attention?”, “How
  is the school doing?”, and “What can I do now?”
- Put the four existing status metrics, conditional exceptions, and the existing
  quick actions above the fold. Keep the full module surface discoverable through
  navigation, a visible “আরও ফিচার / More features” entry point, and command-palette
  search rather than turning the home page into a grid of every feature.
- Preserve the current Bangla-first language model, purple/mint/yellow semantic
  tokens, dark mode, URLs, roles, grants, and feature gates.

This is an inference from the product’s current task surface and shell, supported
by Material’s guidance to order navigation by frequency and importance, and by the
usability principle that relevant information should be easy to scan and act
on ([Material navigation drawer](https://m2.material.io/components/navigation-drawer/web),
[Material cards](https://m2.material.io/components/cards/web),
[Nielsen Norman Group heuristic summary](https://media.nngroup.com/media/articles/attachments/Heuristic_Summary1-compressed.pdf)).

## Scope and evidence boundary

The repository is indexed at generation 2026-09-13T04:19:37Z in full mode. The
relevant files reported no recorded coverage issue, but their metadata is marked
changed; the exact source files were read as ground truth. This note treats the
repository as authoritative for current product facts and the linked standards
as authoritative for general UX/accessibility guidance.

## Existing feature surface

### School-owner navigation

The current school navigation is:

1. Dashboard
2. Students
3. Employees
4. Classes, with Attendance nested under it
5. Exams
6. Fees
7. SMS
8. Notices
9. Messages & Requests, implemented as the always-available hub sentinel
10. Institute
11. Staff

The exact routes, labels, and the presentation-only Classes → Attendance nesting
are defined in [web/lib/school-nav.ts](../../web/lib/school-nav.ts#L23-L65). The
nav builder flattens the visible items while retaining each item’s own screen
gate in [web/components/school-shell.tsx](../../web/components/school-shell.tsx#L31-L73).

The redesign may add visual group headings, but must not change this route or
authorization model. A navigation group is presentation; it is not a new
permission boundary.

### Dashboard content that already exists

The current dashboard fetches and presents:

- total students;
- total employees;
- the latest student-attendance snapshot and rate;
- subscription state and expiry hint;
- a conditional Messages & Requests backlog for questions and corrections;
- a conditional My Classes chip when the signed-in person is linked to classes;
- the editable daily checklist;
- upcoming exams, holidays, and today’s classes;
- quick actions for new student admission, new employee, mark attendance, collect
  fee, and new notice; and
- an owner-only Approvals shortcut.

The data queries and the four KPI tiles are in
[web/app/school/page.tsx](../../web/app/school/page.tsx#L56-L127), the conditional
backlog and My Classes behavior are in
[web/app/school/page.tsx](../../web/app/school/page.tsx#L148-L224), and the
checklist, upcoming activity, quick actions, and owner-only approval link are in
[web/app/school/page.tsx](../../web/app/school/page.tsx#L226-L327). The quick-action
destination list is centralized in [web/lib/school-nav.ts](../../web/lib/school-nav.ts#L73-L86).

The important design implication is that the dashboard is already a compact
operational summary, not a complete module directory. The redesign should sharpen
that role instead of duplicating every sidebar destination inside the home page.

### Shell capabilities that can carry discoverability

The school shell already supplies several persistent discovery and context
mechanisms:

- global search with a school-specific feature index;
- a notification bell;
- SMS balance when available;
- shift and academic-year selectors when applicable;
- theme and language controls;
- profile and logout actions; and
- a sidebar footer CTA for adding a student when the caller can open Students.

These slots are wired in
[web/components/school-shell.tsx](../../web/components/school-shell.tsx#L76-L186)
and rendered by the shared shell in
[web/components/app-shell.tsx](../../web/components/app-shell.tsx#L184-L433).

The search index includes both module destinations and intent-level destinations
such as new admission, new employee, new notice, questions, corrections, and
response performance. It includes English and Bangla keywords and filters entries
by the caller’s screen access in [web/lib/school-search.ts](../../web/lib/school-search.ts#L4-L44)
and [web/components/school-shell.tsx](../../web/components/school-shell.tsx#L78-L90).

The command palette shows recommendations when empty, keyboard navigation, up to
eight matching feature destinations, and RLS-scoped record results after a query
of at least two characters. That behavior is in
[web/components/search-palette.tsx](../../web/components/search-palette.tsx#L9-L14)
and [web/components/search-palette.tsx](../../web/components/search-palette.tsx#L48-L93).

### Gating and role behavior

The screen registry distinguishes grant-gated screens, owner-only screens, and
member screens. School owners can open every school screen; staff users can open
grant-gated screens only when granted, cannot open owner-only Staff, and can open
member screens. The exact rules are in [web/lib/auth/screens.ts](../../web/lib/auth/screens.ts#L18-L37)
and [web/lib/auth/screens.ts](../../web/lib/auth/screens.ts#L48-L88).

The school layout also hides grantable features disabled for the school, while
subscription expiry replaces the page with the subscription gate and an imminent
expiry can show a reminder banner. These behaviors are in
[web/app/school/layout.tsx](../../web/app/school/layout.tsx#L13-L75) and are passed
into the shell as enabled features, role, grants, and subscription state.

The redesign should therefore use **visibility by authorization**, not disabled
cards that advertise inaccessible destinations. Staff should see the same
information architecture with fewer destinations and actions; the owner should
see Staff and owner-only approval actions when applicable.

### Immutable visual and language constraints

Bangla is the default document language and the app loads Hind Siliguri for the
Bengali script alongside Plus Jakarta Sans for Latin text in
[web/app/layout.tsx](../../web/app/layout.tsx#L2-L23). The document language and
theme attribute are stamped from preferences in
[web/app/layout.tsx](../../web/app/layout.tsx#L33-L49).

The current semantic palette defines purple brand values, mint success values,
yellow/sun attention values, and alert values in
[web/app/globals.css](../../web/app/globals.css#L18-L33), with dark-mode mappings
in [web/app/globals.css](../../web/app/globals.css#L80-L105) and
[web/app/globals.css](../../web/app/globals.css#L119-L180). Stitch should consume
these meanings, not introduce a new palette, new language direction, or alternate
copy system.

## Recommended information architecture

Use five visual groups in the left rail while preserving the current labels and
routes:

| Group | Destinations | Presentation rule |
|---|---|---|
| Overview | Dashboard | Always first and visibly active on /school. |
| People | Students; Employees | Keep list destinations together; expose “new” through actions, not extra nav rows. |
| Academic operations | Classes; Attendance; Exams | Keep Attendance nested under Classes as it is today. |
| Money & communication | Fees; SMS; Notices; Messages & Requests | Keep high-frequency operational modules visible; show the hub’s pending state only when there is work. |
| Administration | Institute; Staff | Staff is owner-only; Institute may remain grant-aware for staff. |

This grouping is a presentation recommendation, not a claim that the product
currently has these groups. Material recommends that drawer destinations be
ordered by user importance and related destinations grouped together, and that a
drawer is appropriate when there are five or more top-level destinations
([Material navigation drawer](https://m2.material.io/components/navigation-drawer/web)).

Add a persistent **আরও ফিচার / More features** affordance at the bottom of the
dashboard content, and optionally as a secondary rail item if testing shows users
miss the groups. It should open a compact authorized module index grouped exactly
as above. It should not become a second permission system or duplicate deep
actions.

## First-viewport composition

At desktop width, the Stitch screen should use this order:

1. **Shell header:** school identity, global search, SMS balance when available,
   notifications, shift/year context, theme/language, profile.
2. **Page heading:** Bangla-first welcome and school name, with the English helper
   label below or beside it.
3. **Exception strip:** only when there is an actionable exception: subscription
   expiry, no attendance yet, low attendance state, pending requests/corrections,
   low SMS balance, or owner approvals. Each exception links directly to the
   destination that resolves it.
4. **Four compact status cards:** Students, Employees, Attendance, Subscription.
   Each card should expose a text label, value, state hint, and a direct “Open”
   action or make the whole card a clearly labelled link.
5. **Today’s actions:** the five current quick actions, with New Student Admission
   as the primary action and the remaining actions as secondary actions. Render
   Approvals as an additional owner-only action when present.
6. **Daily checklist preview:** show the due/completed count and the most useful
   checklist items, with a “View all” link to the existing Institute checklist.

The KPI cards should remain single-topic surfaces. Material’s card guidance says
cards should contain content and actions about one subject and be easy to scan for
relevant, actionable information ([Material cards](https://m2.material.io/components/cards/web)).
The recommendation to place exceptions and actions before the lower activity feed
is a product-specific inference from the owner’s operational role and the existing
quick-action/read-model structure in web/app/school/page.tsx.

Keep **Upcoming Activity** below the first-viewport action cluster in a wide
two-column layout: upcoming activity takes the larger column, and a compact
“More features” / recent-navigation panel takes the smaller column. On narrower
desktop widths, stack the panels. The existing implementation already gives
Upcoming Activity the larger column and Quick Actions the smaller column in
[web/app/school/page.tsx](../../web/app/school/page.tsx#L269-L327); the redesign
should simplify its visual hierarchy rather than remove the content.

Do not place a permanent empty Messages & Requests card in the first viewport.
The current implementation intentionally renders it only when the backlog is
non-zero, because an empty card becomes furniture rather than a signal
([web/app/school/page.tsx](../../web/app/school/page.tsx#L165-L224)). Keep that
conditional rule and use it for exception surfaces generally.

## Progressive disclosure pattern

Use three layers:

### Layer 1 — act now

The first viewport contains only the decision-support essentials: exceptions,
four metrics, today’s actions, and a compact checklist. The dashboard should be
readable in a short scan, with no need to understand every school module.

### Layer 2 — continue the work

Below the action cluster, show Upcoming Activity and a compact More features index.
The More features index should show one row per authorized destination, grouped by
the IA above, with a short Bangla label, English helper label, icon, and “Open”
action. It should support a collapsed group state on smaller screens.

For collapsible groups, use a real button with aria-expanded and an optional
aria-controls; W3C’s Disclosure Pattern defines this show/hide behavior and
requires Enter and Space to toggle it ([W3C Disclosure Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)).

### Layer 3 — jump directly

Use the existing command palette as “ফিচার বা রেকর্ড খুঁজুন / Search features or
records”. Empty search can recommend the six most useful destinations; typed search
should match Bangla and English synonyms and jump directly to the exact tab or
creation flow. An editable search field with suggestions should follow the W3C
combobox guidance: collapsed by default, keyboard-operable, Escape to dismiss,
and a distinct accessible name ([W3C Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)).

Keep feature results separate from record results. This mirrors the current
palette’s feature-first then RLS-scoped record behavior in
[web/components/search-palette.tsx](../../web/components/search-palette.tsx#L141-L183)
and avoids making a school owner guess whether a result is a place in the app or
a student/employee/notice record.

## Role-aware visibility

The visual shell should be shared, but its content should be role-aware:

- **School owner:** show all owner-available modules, Staff, Approvals, and
  owner-relevant subscription/SMS actions.
- **Staff user:** show only granted modules plus member screens. Hide Staff and
  owner-only actions rather than showing disabled controls. Preserve My Classes
  only when the person is actually assigned as a class teacher.
- **Any school member:** keep Messages & Requests available as a hub, but scope
  its content and counts to the caller. The current page links each backlog count
  directly to Questions or Corrections, which is the right interaction model for
  an exception ([web/app/school/page.tsx](../../web/app/school/page.tsx#L203-L217)).
- **Feature-disabled school:** remove the disabled grantable module from nav,
  More features, quick actions, and feature search. The existing layout computes
  enabled features for this purpose ([web/app/school/layout.tsx](../../web/app/school/layout.tsx#L26-L48)).

Do not use role-specific dashboard layouts that move the same concepts to
different locations. Keep the shell, card order, and search model stable; change
only visibility and the actions that the caller can perform. This reduces relearning
and keeps the information architecture recognizable across roles, an application
of the recognition-over-recall principle in the NNG heuristic summary
([NNG heuristic summary](https://media.nngroup.com/media/articles/attachments/Heuristic_Summary1-compressed.pdf)).

## Workflow shortcuts and direct destinations

Retain the existing five quick actions and make their outcome explicit:

| Owner intent | Primary label | Destination |
|---|---|---|
| Add a learner | নতুন শিক্ষার্থী ভর্তি / New Student Admission | /school/students/new |
| Add staff | নতুন কর্মচারী / New Employee | /school/employees/new |
| Record attendance | উপস্থিতি নিন / Mark Attendance | /school/attendance |
| Take payment | ফি কালেকশন / Collect Fee | /school/fees |
| Communicate | নতুন নোটিশ / New Notice | /school/notices/new |

The exact current destination mapping is in
[web/lib/school-nav.ts](../../web/lib/school-nav.ts#L80-L86) and the bilingual
labels are in [web/lib/i18n.ts](../../web/lib/i18n.ts#L438-L461). The redesign can
add a small recent-intent row, but should not add a second copy of these actions
in every metric card.

Where a metric has an obvious next action, provide a secondary text link: Students
→ Students list, Employees → Employees list, Attendance → Attendance, Subscription
→ subscription/update flow. This is a recommendation, not a current behavior; it
should be validated because making an entire metric card clickable can create an
ambiguous target. If the entire card is interactive, expose a clear accessible
name and focus state.

## Exception surfacing

Use a three-level attention model:

1. **Blocking:** subscription expired. Keep the existing subscription gate and
   clearly explain what the owner can do; do not bury it in a KPI card. The current
   layout replaces school content with the gate on expiry
   ([web/app/school/layout.tsx](../../web/app/school/layout.tsx#L51-L56)).
2. **Actionable:** subscription nearing expiry, attendance missing or below the
   current low-rate threshold, pending Questions/Corrections, pending Approvals,
   or low/empty SMS balance. Put these in a compact exception strip or alert card
   with one direct action.
3. **Informational:** upcoming exam, holiday, class, checklist completion, and
   healthy subscription. Keep these in the status cards and lower feed without
   competing with actionable work.

An alert should attract attention without moving keyboard focus, and should not
disappear before the user can understand it; use W3C’s Alert guidance for
exceptional states ([W3C Alert Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/)).
Use text and an icon/state label in addition to color. WCAG requires meaningful
non-text UI/state indicators to reach at least 3:1 contrast against adjacent
colors ([WCAG 2.2 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html));
this matters especially because the product’s semantic status colors are immutable.

The existing status-rail approach is compatible with this: color reinforces a
textual state rather than carrying meaning alone, as documented in
[web/components/ui/page.tsx](../../web/components/ui/page.tsx#L67-L114).

## Mobile adaptation

Use one vertical reading order on mobile:

1. top bar with menu, search, notifications, profile/logout;
2. exception strip;
3. four status cards in a two-by-two grid or a one-column list when Bangla labels
   wrap;
4. primary action followed by secondary actions in a full-width stack;
5. checklist preview;
6. upcoming activity; and
7. More features as collapsible groups.

Keep navigation in a temporary drawer on mobile. Material recommends a modal
drawer for mobile and a persistent/standard drawer for larger surfaces, and
warns against pairing it with another primary navigation component
([Material navigation drawer](https://m2.material.io/components/navigation-drawer/web)).
Do not add a bottom navigation bar to compete with eleven existing school
destinations; keep the menu as the single primary navigation model.

The existing shared shell already changes the desktop sidebar to a mobile drawer,
replaces the full search field with an icon, and moves theme/language controls into
the drawer at small widths ([web/components/app-shell.tsx](../../web/components/app-shell.tsx#L220-L314)).
Preserve this behavior and simplify the dashboard content around it.

The page should reflow to a single readable column without page-level horizontal
scroll. WCAG 2.2 Reflow requires content to work at a width equivalent to 320 CSS
pixels without loss of information or functionality, except for content whose
two-dimensional layout is necessary ([WCAG 2.2 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)).
If a future dashboard table needs horizontal scrolling, constrain scrolling to
the table container rather than the whole page.

Make all action cards real links or buttons, keep visible focus, and preserve
keyboard equivalents. WCAG requires all functionality to be operable through a
keyboard interface ([WCAG 2.2 Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)).
The current shell already includes a skip-to-content link and visible focus-ring
classes in [web/components/app-shell.tsx](../../web/components/app-shell.tsx#L252-L273)
and the dashboard actions use focus-visible rings in
[web/app/school/page.tsx](../../web/app/school/page.tsx#L294-L312).

## Decision matrix

Scores are directional design judgments for this product, not measured user-test
results. The comparison uses the repository’s eleven-destination surface and
Material’s navigation/card guidance as constraints.

| Alternative | Feature visibility | Daily scan | Owner task speed | Risk | Decision |
|---|---:|---:|---:|---:|---|
| All-features dashboard | High | Low | Medium | Crowded first viewport; every module competes with exceptions | Reject |
| **Action-first dashboard** | High through rail/search/More features | **High** | **High** | Requires clear progressive disclosure and a complete index | **Recommend** |
| Hub-and-spoke dashboard | High | Medium | Medium | The hub can become a second nav if it duplicates the rail | Use as the shell pattern, not as the sole dashboard layout |
| Guided setup | Low after onboarding | High during setup | Low | Treats an operating school as if it were new | Use only for first-run/setup states |

Recommendation: **Action-first dashboard implemented inside a hub-and-spoke shell**.
This satisfies the owner’s need for fast operational decisions while preserving
discoverability for the complete feature set.

## Stitch-ready screen brief

**Screen:** School owner/admin dashboard, desktop and mobile variants.

**Desktop frame:** 1440px wide reference. Persistent left rail with school identity,
five visual groups, active Dashboard state, and a bottom Add Student CTA. Top bar
contains search, SMS balance when available, notifications, shift/year context,
theme/language, profile, and logout.

**Main content:** Bangla-first heading with English helper text; conditional
exception strip; four compact status cards; a primary/secondary Today’s Actions
cluster; compact daily checklist; then a 2:1 Upcoming Activity + More Features
layout. Use the existing purple/mint/yellow/alert semantics, light/dark mappings,
font stack, border radii, and status-rail language from the repository.

**Interaction states:** owner and staff variants; disabled feature omission;
subscription expired gate; subscription reminder; no attendance yet; low
attendance; pending requests; empty upcoming feed; all checklist items complete;
collapsed sidebar; mobile drawer; empty search, feature search, and record search;
keyboard focus and Escape-close behavior.

**Copy rule:** use existing i18n keys and Bangla-first labels. Add English helper
labels only where they already follow the product’s bilingual convention. Do not
invent a new token name or translate a route into a new product concept.

**Prototype acceptance checks:** an owner can reach every authorized module from
the rail, More features, or search; a staff user never sees owner-only Staff or
Approvals actions; pending work is visible without opening a module; no empty
exception card occupies the first viewport; the mobile screen reads vertically;
and all controls remain keyboard-operable with visible focus.

## Unresolved product decisions

- Confirm the final Bangla labels for the five visual group headings and whether
  English helper labels are shown in the rail or only on the dashboard.
- Decide whether More features is an in-page section, a drawer/popover, or a
  dedicated /school/modules route. The current product has the All Modules
  translation keys but no cited dashboard rendering for that directory.
- Decide which exceptions belong in the first strip and their thresholds: the
  current code has attendance coloring, subscription reminder timing, and SMS
  balance levels, but the dashboard brief needs a single priority order.
- Decide whether KPI cards should be links, whether each needs an explicit Open
  action, or whether only the supporting text link is interactive.
- Decide whether owner Approvals should show a pending count. The current dashboard
  exposes an owner-only link but not a count in the cited page.
- Confirm whether My Classes should remain a chip beside the heading or become a
  conditional Today’s Work card when the class-teacher count is non-zero.
- Validate mobile behavior with real Bangla labels at 320–390 CSS pixels and
  confirm that no card or sticky action creates page-level horizontal scrolling.

## Sources

### General UX and accessibility

- [Material navigation drawer — web](https://m2.material.io/components/navigation-drawer/web)
- [Material navigation rail](https://m2.material.io/components/navigation-rail)
- [Material cards — web](https://m2.material.io/components/cards/web)
- [Material understanding navigation](https://m2.material.io/design/navigation/understanding-navigation.html)
- [W3C WCAG 2.2 — Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
- [W3C WCAG 2.2 — Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)
- [W3C WCAG 2.2 — Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- [W3C WCAG 2.2 — Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- [W3C ARIA Authoring Practices — Disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)
- [W3C ARIA Authoring Practices — Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
- [W3C ARIA Authoring Practices — Alert](https://www.w3.org/WAI/ARIA/apg/patterns/alert/)
- [Nielsen Norman Group — Heuristic Summary](https://media.nngroup.com/media/articles/attachments/Heuristic_Summary1-compressed.pdf)

### Repository evidence

- web/app/school/page.tsx
- web/app/school/layout.tsx
- web/components/school-shell.tsx
- web/components/app-shell.tsx
- web/lib/school-nav.ts
- web/lib/auth/screens.ts
- web/lib/school-search.ts
- web/components/search-palette.tsx
- web/components/dashboard-checklist.tsx
- web/components/upcoming-list.tsx
- web/components/ui/page.tsx
- web/app/globals.css
- web/app/layout.tsx
- web/lib/i18n.ts

