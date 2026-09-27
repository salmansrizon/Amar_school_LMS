import type { LucideIcon } from 'lucide-react'
import { Card } from './page'

// Shared profile-detail shell (student + employee "person" pages, map
// owner-ui-overhaul). Layout per the reference: a full-width header card
// (name, status, meta, actions), a narrow photo+key-facts aside, and a
// stack of icon-badged section cards on the right. Container queries, not
// viewport breakpoints, so the same markup fits the full page and the
// list's RecordDrawer (the drawer is a fixed ~36rem column regardless of
// viewport width).

/** Full-width card: name, a status pill + one line of meta, and right-aligned
 *  actions. `actions` is one wrapping row — callers that need a visually
 *  distinct second line (e.g. a primary action under secondary ones) can pass
 *  a fragment with their own row breaks. */
export function ProfileHeader({
  name,
  status,
  meta,
  actions,
}: {
  name: string
  status: React.ReactNode
  /** One already-joined line, e.g. "Class: Eight / Day - A  |  Roll: 1". */
  meta?: string
  actions?: React.ReactNode
}) {
  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-extrabold">{name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            {status}
            {meta && <span className="truncate">{meta}</span>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
      </div>
    </Card>
  )
}

/** Narrow left column: a photo/placeholder slot, a key-facts list, and an
 *  optional soft-shaded sub-box for a second cluster of facts. All three
 *  slots are optional so the aside also works for entities with no photo
 *  control (e.g. Employee, which has no photo column). */
export function ProfileAside({
  photo,
  facts,
  highlight,
}: {
  photo?: React.ReactNode
  facts?: React.ReactNode
  highlight?: React.ReactNode
}) {
  return (
    <div className="self-start rounded-2xl border border-line bg-paper p-card">
      {photo}
      {facts && (
        <>
          <div className={photo ? 'my-4 border-t border-line' : undefined} />
          <dl className="space-y-3">{facts}</dl>
        </>
      )}
      {highlight && <dl className="mt-4 space-y-3 rounded-xl bg-paper-muted p-3">{highlight}</dl>}
    </div>
  )
}

/** Section card: a round violet icon badge + bold title over a field grid.
 *  `cols` is the column count at the widest breakpoint (@4xl, ~the card's
 *  width on a 1440px page); hairline dividers between columns only render at
 *  that breakpoint, where the grid is guaranteed to be exactly `cols` wide —
 *  narrower containers (a mid-size window, the drawer) stack instead of
 *  faking dividers against a column count that no longer applies. */
export function ProfileSection({
  icon: Icon,
  title,
  cols = 4,
  children,
}: {
  icon: LucideIcon
  title: string
  /** `'flow'` skips the field grid for content that isn't dt/dd pairs, e.g.
   *  the Benefit Flags chips. */
  cols?: 2 | 3 | 4 | 'flow'
  children: React.ReactNode
}) {
  return (
    <section className="mb-4 rounded-2xl border border-line bg-paper p-card">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
          <Icon className="size-4" aria-hidden />
        </span>
        <h3 className="font-bold">{title}</h3>
      </div>
      {cols === 'flow' ? (
        <div className="flex flex-wrap gap-2">{children}</div>
      ) : (
        <dl className={GRID_COLS[cols]}>{children}</dl>
      )}
    </section>
  )
}

const GRID_COLS: Record<2 | 3 | 4, string> = {
  2: 'grid gap-4 @md:grid-cols-2 [&>*]:@md:border-line [&>*:nth-child(2n)]:@md:border-l [&>*:nth-child(2n)]:@md:pl-4',
  3: 'grid gap-4 @md:grid-cols-2 @4xl:grid-cols-3 [&>*]:@4xl:border-line [&>*]:@4xl:border-l [&>*:nth-child(3n+1)]:@4xl:border-l-0 [&>*:nth-child(3n+1)]:@4xl:pl-0',
  4: 'grid gap-4 @md:grid-cols-2 @4xl:grid-cols-4 [&>*]:@4xl:border-line [&>*]:@4xl:border-l [&>*:nth-child(4n+1)]:@4xl:border-l-0 [&>*:nth-child(4n+1)]:@4xl:pl-0',
}

/** One field: a soft icon tile, a muted label and the value — "—" when empty.
 *  Used both loose (the aside's key-facts list) and inside a ProfileSection's
 *  grid. */
export function ProfileField({
  icon: Icon,
  label,
  value,
}: {
  icon?: LucideIcon
  label: string
  value?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      {Icon && (
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-paper-muted text-muted">
          <Icon className="size-4" aria-hidden />
        </span>
      )}
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-muted">{label}</dt>
        <dd className="truncate text-sm font-medium">{value ?? <span className="font-normal text-muted">—</span>}</dd>
      </div>
    </div>
  )
}
