// Shared form-control styling for the two inputs that otherwise render with
// browser/OS chrome instead of the Family design system: `<select>` and
// `<input type="date">` (issue #119).
//
// These style the *native* controls rather than reimplementing them: the native
// select keeps its platform keyboard behaviour and accessibility tree, and the
// native date input keeps the mobile date picker. The parts that look foreign —
// the dropdown arrow and the calendar indicator — are replaced in `globals.css`
// (`@layer base`), so even an unmigrated `<select>` gets the Family chevron.
//
// Exported as class helpers rather than wrapper components, matching
// `buttonClass` in `ui/button.tsx`: call sites keep a plain `<select>` /
// `<input type="date">`, so every native attribute stays reachable without the
// primitive having to forward it.
//
// Sizes mirror the heights already used across the app; `sm` is the default
// because that is what the filter bars and inline forms use.

type Size = 'xs' | 'sm' | 'md'

const SIZE: Record<Size, string> = {
  xs: 'h-8 text-xs',
  sm: 'h-9 text-sm',
  md: 'h-10 text-sm',
}

const BASE = [
  'rounded-md border border-line-strong bg-paper text-ink',
  'outline-none transition',
  'focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-300',
  'disabled:cursor-not-allowed disabled:opacity-60',
].join(' ')

export type FieldOptions = { size?: Size; fullWidth?: boolean }

/**
 * Classes for a native `<select>`. Left and right padding are set separately
 * because the right side has to clear the chevron drawn by the base-layer rule —
 * a `px-*` utility would paint the longest option under it.
 */
export function selectClass({ size = 'sm', fullWidth = false }: FieldOptions = {}) {
  return [BASE, SIZE[size], 'cursor-pointer pl-3 pr-9', fullWidth ? 'w-full' : ''].join(' ')
}

/** Classes for a native `<input type="date">`. */
export function dateInputClass({ size = 'sm', fullWidth = false }: FieldOptions = {}) {
  return [BASE, SIZE[size], 'px-3', fullWidth ? 'w-full' : ''].join(' ')
}
