# Design System and Grid System

Use `Design System/new ui/` as the visual reference for all UI simplification work.

Primary references:

- [`Design System/new ui/README.md`](../../Design%20System/new%20ui/README.md)
- [`sidebar-journey-map-desktop.png`](../../Design%20System/new%20ui/00-reference/sidebar-journey-map-desktop.png)
- [`06-detailed-flowboards/README.md`](../../Design%20System/new%20ui/06-detailed-flowboards/README.md)
- [`07-screen-sequences/README.md`](../../Design%20System/new%20ui/07-screen-sequences/README.md)

## Non-negotiable design direction

- Preserve the current institutional SaaS language: Plus Jakarta Sans, purple primary, neutral surfaces, semantic status colors, rounded cards, subtle borders.
- Preserve existing routes, grants, permissions, and feature gates.
- Use grouped journey navigation visually; grouping is not authorization.
- Use the three-stage task model: `find/orient -> act/edit -> review/recover`.
- Use one dominant primary action per screen/stage.
- Keep secondary actions text-labeled.
- Use [`motion-status-animation.md`](./motion-status-animation.md) for pulse/status feedback; motion must explain state and respect reduced motion.
- Mobile uses drawer/sheet adaptation, not a competing bottom nav.
- User-facing copy follows active language; do not introduce bilingual helper text.

## Existing app tokens to respect

The app already defines the core grid/density tokens in `web/app/globals.css`:

| Token | Value | Use |
| --- | --- | --- |
| `--spacing-card` | `20px` | Internal card padding |
| `--spacing-grid` | `16px` | Gap between cards, fields, and grid items |
| `--spacing-section` | `24px` | Gap between page sections |
| `--spacing-gutter` | `20px` | Page edge gutter owned by the shell |
| `--spacing-row` | `40px` | Table row rhythm |
| `--radius-sm` | `6px` | Small controls |
| `--radius-md` | `8px` | Default controls |
| `--radius-lg` | `12px` | Cards / larger containers |

These should be treated as the product grid rhythm. Do not introduce arbitrary page-level spacing unless a new token is added deliberately.

## Grid rules

### 1. Shell owns the page frame

`AppShell` owns:

- main landmark
- page gutters
- page width
- topbar/sidebar/drawer frame

Individual pages should render content, not nested page frames. Avoid new nested `<main>`, ad-hoc `max-w-*`, and duplicate page padding unless the route is a print route.

### 2. Use archetypes instead of one-off layouts

Use the app archetypes from `web/components/ui/page.tsx`:

| Archetype | Recommended structure |
| --- | --- |
| Dashboard | KPI/status cards in responsive grids using `gap-grid` |
| List/table | `Card` + `Toolbar` + `TableFrame`; table scrolls inside its own frame |
| Form | `FormGrid` with `sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4` |
| Detail/Profile | Profile header + content columns + action rail/drawer |
| Print | Dedicated print layout; exempt from shell grid |

### 3. Default responsive grid

For forms and dense edit surfaces, use:

```tsx
<div className="grid gap-grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
  ...fields
</div>
```

For dashboard cards, use the same rhythm but adapt column count by content:

```tsx
<div className="grid gap-grid md:grid-cols-2 xl:grid-cols-4">
  ...cards
</div>
```

For detail/profile content:

```tsx
<div className="grid gap-section xl:grid-cols-[minmax(0,1fr)_20rem]">
  <section>primary profile/details</section>
  <aside>actions/status/recovery</aside>
</div>
```

### 4. Tables stay clustered and scroll inside the card

Use `TableFrame`, `thClass`, `tdClass`, `trClass`, `spacerClass`, and `cellCapClass` conventions.

Rules:

- Header is sticky.
- Row height follows `h-row` / `--spacing-row`.
- Long free-text cells truncate with a cap.
- A trailing spacer column absorbs unused width so meaningful columns cluster left.
- No horizontal scroll on the page shell; if needed, scroll inside the table card.

### 5. Record Quick View drawer grid

Use this layout for the first Student/Employee drawer implementation:

Desktop:

- Drawer width: `min(720px, calc(100vw - 80px))` for full editable forms.
- Summary-only drawer may use `min(560px, calc(100vw - 80px))`.
- Header: sticky top, title + close + edit/save/cancel actions.
- Body: `space-y-section`.
- Profile summary: 2-column grid where useful; avoid table-like dense labels for core identity.
- Edit mode: `FormGrid` (`sm:2`, `xl:3`, `2xl:4`) inside the drawer body.

Mobile:

- Full-screen sheet.
- 16px gutters.
- 44px minimum controls.
- Sticky header and sticky bottom save/cancel bar for long forms.

### 6. Status rail instead of badge noise

Use the `Card` tone/status rail pattern from `web/components/ui/page.tsx` for status-heavy records. Color must be paired with text; color alone must not carry meaning.

### 7. Recovery-state grid

Every journey needs a visible recovery state in the same grid system:

- Empty list: explanation + one clear primary action.
- No search results: show active filters + clear filters.
- Blocked permission: explain who can perform the action and where to go back.
- Missing setup: link to setup route.
- Print unavailable: explain the missing data needed before print appears.

## Module application

| Module | Grid application |
| --- | --- |
| Students | List uses table/card grid; row opens Record Quick View drawer; full edit form uses FormGrid. |
| Employees | Same as Students. |
| Classes | Class Offering cards/table use clustered columns; quick view summarizes subjects, routine, archive status. |
| Attendance | Marking grids keep sticky headers and row rhythm; recovery states explain missing class/students/date. |
| Fees | Collection form uses FormGrid; receipts/ledger use print layout; fee records use summary drawer, not casual inline edits. |
| Exams | Exam list is clustered; setup actions are staged; printables remain dedicated print views. |
| SMS/Notices | Compose forms use FormGrid; targeting/review uses two-column review grid before send/publish. |
| Super Admin | Grouped sidebar + dashboard grids; detail pages use summary/action side rail. |

## Acceptance checklist for future UI work

- Uses `Design System/new ui/` references for hierarchy and interaction.
- Uses existing spacing tokens, not arbitrary spacing.
- Does not add nested page `<main>` under `AppShell`.
- Has a clear page archetype: dashboard, list, form, detail, print, or drawer.
- Has one dominant primary action.
- Uses meaningful status animation only where it communicates live/pending/unread/saving/error/success state.
- Respects `prefers-reduced-motion`.
- Handles empty/no-results/blocked/recovery states.
- Is touch-safe on mobile.
- Preserves routes, permissions, feature gates, and print routes.
