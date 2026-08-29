# Eduwave Design System — Token Sheet (canonical for `ui/` mockups)

Canonical reference for re-theming the `ui/` static mockups. Extracted from the Eduwave LMS
design-system showcase (see `Design System/Eduwave Design System (standalone).html`, now a
visual reference only — not linked by any mockup). Adopted per the `/grilling` session
2026-07-13: **Eduwave replaces the Family Design System as the `ui/` visual language**, while
all existing bilingual Bangla/English copy and HTML structure stays untouched.

> **Hard rule (preserves DESIGN-SPEC rule 3 + ADR 0004):** the violet brand scale is
> **chrome and primary-action color only**. Status meaning is NEVER conveyed with violet — it
> uses the dedicated semantic status palette below.

## Brand — Purple (chrome / primary action only)

| Token            | Hex      |
|------------------|----------|
| `--brand-50`     | `#F3EEFE`|
| `--brand-100`    | `#E4D9FC`|
| `--brand-300`    | `#B694F5`|
| `--brand-500`    | `#8957EA`|
| `--brand-600`    | `#632DD9`| ← primary brand
| `--brand-700`    | `#4B21B8`|

## Semantic status palette (NON-violet — for `.badge-*`, status, alerts)

| Status   | Token prefix        | bg        | fg        | border    | Source tone |
|----------|---------------------|-----------|-----------|-----------|-------------|
| success  | `--success-*`       | `#E7F8F0` | `#0E7A4E` | `#9FE3C4` | Green `#32C285` |
| warning  | `--warning-*`       | `#FDF3DD` | `#9A6B00` | `#F4D58A` | Orange `#F4A719` |
| danger   | `--danger-*`        | `#FCE4EE` | `#B81E5C` | `#F4A9C8` | Pink `#F3548E` |
| info     | `--info-*`          | `#EEF1F6` | `#3F5168` | `#C3CCDA` | Slate `#6B7A91` |
| neutral  | `--neutral-*`       | `#F6F5FA` | `#6E6B85` | `#E7E5F0` | Ink/Border |
| extended | `.badge-extended`   | `#F6F5FA` | `#3A3752` | `#C3BCDD` (dashed) | flagged, hue-free |

> `extended` (Extended-access School flag, per CONTEXT.md) is a status, so it is deliberately
> hue-free (ink on Surface Muted, dashed border) — never violet.

## Ink & Surface (neutrals)

| Token             | Hex      |
|-------------------|----------|
| `--ink-900`       | `#1A1830`| ← text-primary
| `--ink-700`       | `#3A3752`|
| `--ink-500`       | `#6E6B85`| ← text-secondary
| `--border`        | `#E7E5F0`|
| `--surface-muted` | `#F6F5FA`| ← bg-page

## Typography

- **English headings:** Playfair Display (display 40/700, H1 32/700)
- **English body / UI:** Inter (H2 24/600, body 16/400)
- **Bangla (all text):** Hind Siliguri (Playfair/Inter have no Bengali glyphs — Bangla falls
  back to Hind Siliguri automatically because only one language is visible at a time, ADR 0004)
- Font stacks:
  - `--font-family: 'Inter', 'Hind Siliguri', 'Noto Sans Bengali', system-ui, sans-serif;`
  - `--font-display: 'Playfair Display', 'Hind Siliguri', 'Noto Sans Bengali', serif;`

## Spacing (4px scale)

`4 / 8 / 12 / 16 / 24 / 40` → `--space-1…--space-8` (keep existing step names).

## Radius (generous, rounded)

| Token           | Value |
|-----------------|-------|
| `--radius-sm`   | 8px   |
| `--radius-md`   | 12px  |
| `--radius-lg`   | 16px  |
| `--radius-full` | 999px |

## Elevation

- `--shadow-sm` (card): `0 8px 24px rgba(26, 24, 48, 0.08)`
- `--shadow-md` (modal/raised): `0 16px 48px rgba(26, 24, 48, 0.16)`

## Implementation note

These tokens are applied by editing **`ui/shared/design-system.css` only** — every mockup links
that one shared file, so the re-theme propagates to all ~60 pages with zero HTML edits. The
production `web/` app remains on the Family tokens (Tailwind `@theme`, ADR 0006) for now; this
token sheet is the source of truth for `ui/` mockups only.
