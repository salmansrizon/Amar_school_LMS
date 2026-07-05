# Figma-importable mockups

There is no way to hand-author a native `.fig` file — it's a proprietary binary Figma's own
editor produces. SVG is the format Figma actually understands natively for import, so that's
what's here. Every file becomes a fully editable frame (real vector shapes, text nodes, rects
you can restyle) once imported — not a flattened image.

## How to bring these into Figma

1. Open or create a Figma file.
2. Drag-and-drop any `.svg` file below directly onto the canvas, **or** open the file in a
   browser, copy the raw SVG markup, and paste it into Figma (Edit → Paste, or Ctrl/Cmd+V).
3. Figma will convert it into a frame containing grouped vector/text layers you can select,
   ungroup, and restyle like any other Figma object.
4. Font note: text uses `Hind Siliguri` (Bangla-primary, per docs/adr/0004). If that font isn't
   installed/available in your Figma font list, Figma will substitute a fallback and flag it —
   install Hind Siliguri (Google Fonts) locally first for a faithful render.

## Files

- **`00-design-system.svg`** — the style reference sheet: brand purple/violet scale, semantic
  status colors (success/warning/danger/info — the only carriers of status meaning, per
  resolved decision), type scale in Hind Siliguri (Bangla + Latin side by side), spacing scale,
  radius scale, and component samples (buttons, badges, KPI card, compact table row). Import
  this first/as page one of a real Figma file — it's the system everything else draws from.
- **`01-login.svg`** — the single shared login screen (ADR 0003: one login, role determines
  what's next), showing the Bangla-primary/English-secondary language switch (ADR 0004) and
  light/dark switch (ADR 0005).
- **`02-dashboard-school-owner.svg`** — School Owner dashboard: sidebar nav shell, KPI cards,
  a Trial-status banner, recent activity, quick actions.
- **`03-students-list.svg`** — the compact, fixed-density data table language (resolved
  decision: no density toggle) applied to the Students module, including Behaviour Log rating
  badges and Old-Student status.
- **`04-super-admin-dealer-territory.svg`** — Super Admin's Dealer detail screen, demonstrating
  the resolved Territory model: multiple Territory assignments per Dealer, tier stored
  per-assignment (descriptive only), and Extended-access Schools visually flagged with a badge
  rather than blended silently into the list.

## What's deliberately not here

This covers a representative slice (style sheet + 4 key screens), not every screen/state for
every module in the PRD — see `docs/PRD.md` in the docs project for the full functional scope,
and `ui/` (in the same project, alongside `docs/`) for the parallel HTML mockup effort covering
more screens at lower per-screen fidelity.

Geometry constants used throughout, matching `ui/shared/design-system.css`: sidebar 232px,
topbar 60px, table row height 36px, control height 32–40px, corner radius 4/6/10px.
