# Motion and Status Animation System

Use subtle motion to make the LMS feel alive and responsive, while preserving the calm institutional SaaS style from `Design System/new ui/`.

This is a UI standard for future implementation. It does not change app code by itself.

## Motion principles

1. **Motion must explain state** - animate because something changed, needs attention, loaded, saved, failed, expanded, collapsed, opened, or closed.
2. **Do not decorate everything** - animate 1-2 meaningful elements per view at most.
3. **Prefer transform and opacity** - avoid animating width, height, top, left, or layout-heavy properties.
4. **Keep it fast** - micro-interactions should be 150-300ms; complex transitions up to 400ms.
5. **Respect reduced motion** - every repeating or directional animation must stop or simplify under `prefers-reduced-motion`.
6. **Do not block input** - users can click, close, save, or navigate during/after transitions.

## Animation tokens

Recommended implementation tokens:

| Token | Value | Use |
| --- | --- | --- |
| `--motion-fast` | `150ms` | Button press, hover, icon feedback |
| `--motion-base` | `220ms` | Drawer, cards, state changes |
| `--motion-slow` | `320ms` | Larger panel/page transitions |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Enter/open/appear |
| `--ease-in` | `cubic-bezier(0.7, 0, 0.84, 0)` | Exit/close/disappear |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | General UI transitions |

## Pulse animation rules

Pulse is allowed, but only for statuses that truly need attention.

| Status | Pulse? | Recommended animation |
| --- | --- | --- |
| Live / active now | Yes | Soft dot pulse, low opacity ring, 1.8-2.4s loop |
| Pending approval / waiting action | Yes, subtle | Slow amber pulse on status dot or rail only |
| New unread item | Yes, temporary | Pulse for first 3-5 seconds or until seen |
| Low SMS credit / payment due soon | Yes, restrained | Gentle status-dot pulse, not whole card flashing |
| Error / failed save | No continuous pulse | One short shake or red fade, then static error text |
| Success / saved | No continuous pulse | One checkmark pop/fade, then static state |
| Loading | Prefer skeleton/spinner | Skeleton shimmer only if loading exceeds 300ms |
| Archived / inactive | No | Static muted state |

## Status animation patterns

### 1. Status dot pulse

Use for active/live/pending attention states.

Visual:

- Solid center dot in semantic color.
- Expanding translucent ring.
- Loop every 1.8-2.4s.
- Pair with text label, never color alone.

Example statuses:

- Attendance marking open now.
- SMS sending in progress.
- Workflow approval pending.
- New unread request.

### 2. Save/success feedback

Use after form save, toggle, payment update, or permission update.

Visual:

- Button shows loading state.
- On success, small check icon scales from 0.9 -> 1 and fades in.
- Toast or inline confirmation appears.
- Updated row/card briefly highlights with `bg-mint-soft`, then fades to normal.

Duration:

- Button/check: 150-220ms.
- Row highlight: 900-1400ms fade.

### 3. Error feedback

Use when validation or server action fails.

Visual:

- Inline error appears near the field/action.
- Error area fades/slides in by 4-8px.
- Optional one-time micro-shake on the invalid field group.
- Do not keep shaking or pulsing.

### 4. Drawer and sheet motion

Used by Record Quick View.

Desktop:

- Overlay fades in.
- Drawer slides from right by 24-32px while fading in.
- Exit is faster than enter.

Mobile:

- Full-screen sheet rises from bottom or slides from right, depending on navigation hierarchy.
- Header stays sticky.
- Respect reduced motion by using instant opacity only.

### 5. Table/list interaction

- Hover: background wash only, 150ms.
- Press/clickable row: subtle scale is allowed for cards, not dense table rows.
- New/updated row: temporary soft highlight fade.
- Deleting/archiving: row fades out after confirmation, then list closes the gap.

### 6. Loading states

- Under 300ms: no loader needed.
- Over 300ms: skeleton or inline progress.
- Long actions: button-level spinner plus disabled duplicate-submit state.
- Never use pulse as a generic loader when skeleton would explain content shape better.

## Module-specific recommendations

| Module | Animation use |
| --- | --- |
| Students | Row hover, drawer slide, save highlight, pending correction pulse dot, archived fade/muted state |
| Employees | Same as Students; attendance late/absent statuses use static semantic rail plus optional attention dot |
| Classes | Active academic year/shift can use static chip; no constant animation except newly copied/restored offerings highlight |
| Attendance | Current date/session indicator can pulse; save/correction rows highlight after update |
| Fees | Payment saved highlight; overdue status may use restrained amber/red attention dot; receipt print action stays static |
| Exams | Open exam status may use subtle dot; published result success uses check/fade; promotion requires static confirmation, not animated urgency |
| SMS | Sending uses inline spinner/progress; low credit can pulse subtly; sent log row highlights after completion |
| Notices/Messages | New unread request pulse dot; read state fades to normal |
| Super Admin | Job monitor live jobs can pulse; settlements/agreements use static high-trust states with confirmation feedback only |

## Accessibility requirements

- Every animated status must have text: `Pending`, `Unread`, `Live`, `Failed`, `Saved`, etc.
- Use `aria-live="polite"` for save/success/status messages where needed.
- Do not rely on color or animation alone.
- Under `prefers-reduced-motion: reduce`:
  - Disable pulse loops.
  - Disable shimmer.
  - Replace drawer slide with simple fade or instant display.
  - Keep text/status changes visible.

## Suggested CSS primitives

```css
@media (prefers-reduced-motion: no-preference) {
  .status-pulse::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 9999px;
    background: currentColor;
    opacity: 0.18;
    animation: status-pulse 2s ease-out infinite;
  }

  @keyframes status-pulse {
    0% { transform: scale(0.75); opacity: 0.22; }
    70% { transform: scale(1.8); opacity: 0; }
    100% { transform: scale(1.8); opacity: 0; }
  }

  .row-saved-highlight {
    animation: row-saved-highlight 1.2s ease-out 1;
  }

  @keyframes row-saved-highlight {
    0% { background: var(--color-mint-soft); }
    100% { background: transparent; }
  }
}
```

## Do not animate

- Entire dashboards constantly.
- Every status badge at once.
- Financial totals in a way that makes values hard to read.
- Print pages or print-only content.
- Permission/security decisions beyond a clear success/error confirmation.
