# Detailed E2E flowboards

These ten high-resolution images are model-facing UI references. Each pair shows one School Owner sidebar group on desktop and mobile.

| Sidebar group | Desktop | Mobile | Primary journey |
| --- | --- | --- | --- |
| Overview | `overview-flowboard-desktop.png` | `overview-flowboard-mobile.png` | Dashboard → urgent action → all caught up |
| People | `people-flowboard-desktop.png` | `people-flowboard-mobile.png` | Student Directory → Student Admission → new Student review |
| Academics | `academics-flowboard-desktop.png` | `academics-flowboard-mobile.png` | Class Offering → Attendance → Results review/publish |
| Finance & Communication | `finance-communication-flowboard-desktop.png` | `finance-communication-flowboard-mobile.png` | Fee collection → targeted SMS → Notice/Requests follow-up |
| Administration | `administration-flowboard-desktop.png` | `administration-flowboard-mobile.png` | Institution Settings → Staff Permissions → review/save |

## What the next model must adopt

- Preserve the current institutional SaaS visual language: Plus Jakarta Sans, purple primary, neutral surfaces, semantic status colors, existing cards, borders and radii.
- Render the School Owner sidebar as expandable groups. Show the current group expanded and the active submenu in purple.
- Preserve every route, feature boundary and Permission Grant. The grouping is navigation presentation only.
- Use a three-stage task hierarchy: **find/orient → act/edit → review/recover**.
- Use one visually dominant primary action per stage. Secondary actions must have explicit text labels.
- Include a real recovery state: validation error, no-results state, blocked publish, owner-only access warning, or unsent/insufficient-credit condition.
- Keep mobile as a vertical, touch-safe adaptation with a drawer submenu, 16px gutters and controls at least 44px high.
- Render end-user UI copy in the currently selected language only. For this reference, that means Bangla; do not reproduce any English helper annotations that may appear in generated image metadata.

## Suggested attachment instruction

> Use the attached flowboard as a strict visual and interaction reference. Recreate its grouped sidebar, expanded submenu state, three-stage task journey, action hierarchy, recovery state, spacing, tokens and responsive behavior. Preserve the existing feature set and permissions. Use Bangla-only end-user UI text; do not copy English reference annotations.
