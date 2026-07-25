// Shared shell design tokens (map #171, T1). Both components/school-shell.tsx and
// components/super-admin-shell.tsx build the same chrome, so the focus-ring and
// icon-button classes live here once — a token change lands in both shells from
// one edit instead of drifting apart.

/** Visible keyboard-focus ring (keyboard users need a focus cue). */
export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-paper'

/** Round icon button sized to the 44px minimum touch target. */
export const ICON_BUTTON = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full transition ${FOCUS_RING}`
