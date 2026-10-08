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
// One control height for every field (`FIELD_HEIGHT`): 44px on phones (the
// app's tap-target convention, cf. `ui/button.tsx`), 40px from `sm:`. The
// ComboboxField / SelectField / Combobox triggers and the DataTable search use
// it too, so a filter bar mixing any of them lines up as one set. The height
// is fixed (not padding-derived) so Bangla glyphs, whose line box is taller
// than Latin, cannot push a control out of line; inputs and selects centre
// their single line inside it. `sm` and `md` are kept as aliases for the
// existing call sites; `xs` is the dense in-table size.

export const FIELD_HEIGHT = 'h-11 sm:h-10'

type Size = 'xs' | 'sm' | 'md'

const SIZE: Record<Size, string> = {
  xs: 'h-8 text-xs',
  sm: `${FIELD_HEIGHT} text-sm`,
  md: `${FIELD_HEIGHT} text-sm`,
}

const BASE = [
  'rounded-md border border-line-strong bg-paper text-ink placeholder:text-muted',
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

/** Classes for a native text / search / date / month `<input>`. */
export function inputClass({ size = 'sm', fullWidth = false }: FieldOptions = {}) {
  return [BASE, SIZE[size], 'min-w-0 px-3', fullWidth ? 'w-full' : ''].join(' ')
}

export const dateInputClass = inputClass

/** The "Filter" / "Apply" submit button that sits at the end of a filter bar:
 *  same height, radius and border as the fields beside it. */
export function filterButtonClass({ fullWidth = false }: Pick<FieldOptions, 'fullWidth'> = {}) {
  return [
    'inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-line-strong bg-paper px-4 text-sm font-semibold text-ink',
    'outline-none transition hover:bg-paper-muted focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-300',
    'disabled:cursor-not-allowed disabled:opacity-60',
    FIELD_HEIGHT,
    fullWidth ? 'w-full' : '',
  ].join(' ')
}
