# 0006 — Tailwind for the production app, not the mockups' design-system.css

## Status
Accepted (2026-07-07)

## Context
The `ui/` mockups ship a complete hand-rolled stylesheet (`ui/shared/design-system.css`) themed
after the Family Design System (`Design System/` folder): token-based colors, radii, shadows,
Plus Jakarta Sans + Hind Siliguri, dark mode, responsive drawer nav. The production Next.js app
in `web/` could have imported it wholesale — page markup would port almost 1:1 from the mockups.

## Decision
The production app is styled with **Tailwind CSS v4** instead. The Family design tokens (color
palette, radius scale, shadows, font stack) are declared once in the Tailwind `@theme` block, and
the mockups' visual vocabulary (app shell, data tables, KPI cards, badges, pill buttons) is
rebuilt as shared React components using Tailwind utilities.

## Consequences
- `ui/shared/design-system.css` remains the source of truth for the *mockups only*; the `@theme`
  block in `web/` is the source of truth for the app. A palette change must be applied in both
  places while the mockups are still referenced.
- Component markup in `web/` will not textually match the mockup HTML; the mockups are a visual
  spec, not a copy-paste source.
- Standard Tailwind ecosystem benefits (tree-shaken utilities, editor tooling, no class-name
  drift) apply to all future app work.
