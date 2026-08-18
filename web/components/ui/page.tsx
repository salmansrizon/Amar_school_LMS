import Link from 'next/link'

// Page archetype kit (map #370, gate #372).
//
// The rule these encode: **the shell owns the page.** `components/app-shell.tsx`
// renders the single `<main>` landmark, the fluid width and the gutters. A page
// renders *bare content* — no `<main>`, no `mx-auto`, no `max-w-*`, no page
// padding. 76 of 81 school pages currently break that: they nest a second
// `<main>` inside the shell's (two landmarks, which is an a11y fault on its own)
// and then cap themselves, throwing away the width the shell just handed them —
// on a 2560px screen the students list rendered at 896px inside a 2284px frame.
//
// Widths are therefore not a page's business. What *is* a page's business is how
// its content uses the width, and that differs by archetype:
//
//   dashboard  — widget grid, `gap-grid`
//   list/table — one Card holding the full table, scrolling inside itself
//   form       — FormGrid: multi-column *within* the width, never a narrow strip
//   detail     — profile header over content columns
//   print      — exempt (ADR 0007), keeps its own A4 layout
//
// Density comes from the tokens (`--spacing-card` / `-grid` / `-section` / `-row`),
// so a change to the rhythm is one edit, not 121.

export function PageHeader({
  title,
  backHref,
  backLabel,
  actions,
}: {
  title: string
  /** Omit on a top-level page; the sidebar is the way back from there. */
  backHref?: string
  backLabel?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-section flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {backHref && (
          <Link
            href={backHref}
            aria-label={backLabel}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </Link>
        )}
        <h1 className="truncate text-2xl font-extrabold">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/**
 * The status rail — the one place this design spends boldness. State is carried
 * by a 2px coloured edge rather than by scattering filled pill chips through the
 * content, so a scan down the left edge reads status without the eye stopping on
 * a badge in every row. The colour is decoration: every rail is paired with a
 * text label, never left to carry meaning alone.
 */
export type Tone = 'brand' | 'mint' | 'sun' | 'alert' | 'sky' | 'muted'

const RAIL: Record<Tone, string> = {
  brand: 'border-l-brand-500',
  mint: 'border-l-mint',
  sun: 'border-l-sun',
  alert: 'border-l-alert',
  sky: 'border-l-sky',
  muted: 'border-l-line-strong',
}

/** The hairline surface everything sits on: a 1px line, a flat ground, no lift.
 *  `padded={false}` for a Card whose only child is a table — the table supplies
 *  its own cell padding and should reach the card's edges.
 *  `tone` adds the status rail down its left edge. */
export function Card({
  children,
  padded = true,
  tone,
  className = '',
}: {
  children: React.ReactNode
  padded?: boolean
  tone?: Tone
  className?: string
}) {
  return (
    <section
      className={`rounded-lg border border-line bg-paper ${tone ? `border-l-2 ${RAIL[tone]}` : ''} ${
        padded ? 'p-card' : ''
      } ${className}`}
    >
      {children}
    </section>
  )
}

/** The rail on a table row. Applied to the row's *first* cell, because a border
 *  on `<tr>` is unreliable across border-collapse implementations. */
export function railClass(tone: Tone | undefined): string {
  return tone ? `border-l-2 ${RAIL[tone]}` : 'border-l-2 border-l-transparent'
}

/** Filters on the left, page actions on the right; wraps to its own lines when
 *  the viewport cannot hold both. */
export function Toolbar({ filters, actions }: { filters?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-grid flex flex-wrap items-center justify-between gap-grid">
      {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : <div />}
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/**
 * A table that fills the page and scrolls inside its own frame rather than
 * pushing the page sideways — the shell must never scroll horizontally. The
 * header sticks so column meaning survives a long roster.
 */
export function TableFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">{children}</table>
    </div>
  )
}

// `whitespace-nowrap` keeps every row exactly one `--spacing-row` tall. Once the
// columns cluster left they size to their content, and a single long value would
// otherwise wrap and make one row three times the height of its neighbours,
// destroying the rhythm the density scale exists to hold. Anything genuinely too
// long is capped with `cellCapClass`; the frame scrolls if the total still exceeds
// the viewport.
export const thClass =
  'sticky top-0 z-10 whitespace-nowrap bg-paper px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
export const tdClass = 'whitespace-nowrap px-3 py-2 text-sm'
/** Row height comes from the density token, so the rhythm is tuned in one place. */
export const trClass = 'h-row border-b border-line last:border-0 transition hover:bg-paper-muted'

/**
 * Last cell of a clustered table, in both the header and every row.
 *
 * A seven-column table stretched across 1920px puts a metre of whitespace
 * between a name and its status. This greedy trailing cell soaks up the leftover
 * width so the real columns pack left at their natural size, and the table stops
 * spreading just because the viewport is wide.
 */
export const spacerClass = 'w-full'

/** Cap for a free-text column so one long value cannot drag the layout wide;
 *  the cell truncates rather than pushing its neighbours off the cluster. */
export const cellCapClass = 'max-w-64 truncate'

/**
 * Form fields laid across the width instead of down a narrow column. This is the
 * whole point of the archetype rule for forms: legibility comes from the *field*
 * measure, which each control sets for itself, not from squeezing the page.
 */
export function FormGrid({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`grid gap-grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 ${className}`}>
      {children}
    </div>
  )
}

/** A labelled group inside a form, spanning the full grid so its own fields can
 *  subdivide the width. */
export function FormSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Card className="mb-grid">
      <h2 className="mb-grid font-bold">{title}</h2>
      {children}
    </Card>
  )
}
