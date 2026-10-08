# Motion, live-pulse and icon audit (owner and student portals)

Method: read `web/app/school/**`, `web/app/student/**`, the shells and the shared widgets. Rule from the owner: a pulse means "live or needs you now", never decoration (the first pass pinged every alert-tone card and was rejected).

## What already existed

- `globals.css`: `ui-rise` / `ui-stagger` (entrance), `ui-bar` (progress fill), one reduced-motion block (durations forced to ~0).
- `ToneDot` (opt-in ping), `Pill pulse` / `live` (in `data-table`, untouched), `StatCard pulse` (opt-in), `WorkflowCard pulse`, `AlertStrip` rows.
- Sidebar icons existed for owner (`school-icons`, hand-drawn paths) and student (a second, different set of paths in `student-shell`), so "attendance" or "fees" was a different glyph in each portal.
- Toasts are `sonner` (already animated, owns its own icons).

## Findings

### Live or urgent, and how it was shown

| Where | State | Before | Verdict |
|---|---|---|---|
| Owner dashboard AlertStrip | approvals, corrections, questions, unmarked classes, low SMS | every `alert`-tone row pinged | Too many. Only the first alert-tone row pings. |
| Owner dashboard attendance card | rate under 85% | pinged next to the strip | Pings only when the strip has no pinging row. |
| Student dashboard | overdue homework, fee overdue, low attendance (cards) plus the strip | up to 4 pings at once | One per dashboard: the strip's first row, else the single most urgent card (`pickPulse`). |
| Owner fees, students lists | every `due` row pulsed | N pulses in a table | First due row only. |
| Owner employees list | every "not in yet" pulsed | N pulses | First row only. |
| Owner staff list | every "no access" pulsed | N pulses | First row only. |
| Owner exams list | every `setup` / `marksPending` chip pulsed | N pulses | First such exam only. |
| Messages and Requests | unanswered questions, pending corrections | tab count badge, no live cue, no sidebar cue | Sidebar count on the entry; questions tab badge pulses (corrections wait quietly). |
| Student bell | unread notifications | static dot | Bell tilts once on load when something is unread (one-shot, not a loop). |
| Student exams / fees / tasks / questions | exam today, first overdue month, first overdue task, waiting question | already one `ToneDot pulse` each | Keep as is. |
| Owner attendance mark | classes not marked today | one `WorkflowCard pulse` | Keep. |
| Today's routine period "in progress" | no data | `routine_slots` has an ordinal `period` and no clock times | Cannot be said truthfully. Not added. |

### State changes on screen

- Save / delete: `sonner` toast (animated by the library). No row highlight exists because pages do not know which row was saved without behaviour change. `ui-flash` is defined but no page uses it.
- Tab switch: `SectionTabs` are route links; an underline cannot slide across a page navigation. The active underline now grows in once (`ui-ink`).
- Drawer / dialog: native `<dialog>` (Modal, ConfirmDialog) had no entrance; the route modal already fades. Native dialogs now scale/fade in.
- Empty to filled: lists have no transition; tables had none. First-load fade for the first 12 rows only.
- Loading: owner `loading.tsx` used `animate-pulse` on the whole block, student used the shared `PageSkeleton` (also `animate-pulse`).

### Missing icons

- Page headers: none had an icon (91 `PageHeader` uses).
- Section tabs (hub, student groups): text only.
- Empty states: text only (21 uses).
- Sidebar: present but not shared between portals.
- Stat cards: present (large background art), inline paths.
- Action buttons: dashboard quick actions and alert actions had icons or none; alert "open" buttons had no arrow cue.

## Plan (what was chosen)

1. One pulse rule, enforced in shared code: `AlertStrip` pulses its first alert row; lists pulse their first needing row; the dashboards pick one with `pickPulse` (`web/lib/ui/pulse.ts`, unit tested). A count of 0 never pulses.
2. One icon table, `web/lib/ui/concept-icons.ts` (lucide), used by both sidebars (via `Icon`), `PageHeader icon`, `SectionTab icon`, `EmptyState icon`.
3. Motion added to `globals.css` only, all behind `prefers-reduced-motion`: `ui-pop`, `ui-fade`, `ui-ink`, `ui-ring`, `ui-press`, `ui-lift`, `ui-nudge`, `ui-tilt`, `ui-rows`, `ui-shimmer`, native dialog entrance. Entrance, hover and press effects use `opacity`, `translate`, `scale`, `rotate` (individual properties, so they compose with the stagger fill).
4. Sidebar count badge (`AppNavItem.badge`) for Messages and Requests, from the existing `hubSummary` head counts.

## Deliberately not animated

- Number count-up: figures are Bangla/English formatted strings; a CSS-only counter would break the numerals and the printed value. Bars already fill (`ui-bar`).
- Table cells beyond the first 12 rows, and any hover or press on rows.
- Any infinite animation other than the live pulse and the loading sheen.
- Success check on toasts: `sonner` owns the toast markup; changing it needs more than CSS.
- Routine "period now" pulse (no clock data), per-row save highlight (no saved-row signal).
