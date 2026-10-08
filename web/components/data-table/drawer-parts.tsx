import Link from 'next/link'
import type { ReactNode } from 'react'
import { EntityAvatar } from '@/components/entity-avatar'

// Shared record-drawer anatomy (drawer redesign, reference: right-side panel
// over a dimmed list — avatar+name header, key-facts rows, collapsible
// sections of linked items, sticky Cancel/primary footer). record-drawer.tsx
// stays the dialog mechanics (open/close/focus-return/mobile sheet); these
// five are pure presentation, reused by every record drawer body
// (students/employees/exams/classes/fees/notices/approvals/questions/staff)
// instead of each page hand-rolling its own dl/section markup.

/** Avatar (or initials tile) + bold name + muted sub-line + optional status
 *  pill. Pass as RecordDrawer's `header` slot — RecordDrawer still renders an
 *  sr-only Drawer.Title from its own `title` prop for accessibility, plus the
 *  full-page link and the ✕, after this. */
export function DrawerHeader({
  name,
  avatarId,
  subtitle,
  status,
}: {
  name: string
  /** Id EntityAvatar hashes for a stable colour; omit for no avatar tile. */
  avatarId?: string
  subtitle?: ReactNode
  status?: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {avatarId && <EntityAvatar name={name} id={avatarId} size="lg" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-extrabold">{name}</p>
        {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
      </div>
      {status}
    </div>
  )
}

export type DrawerFact = { icon: ReactNode; label: string; value: ReactNode }

/** Key-facts list: small round icon + muted label (left), value (right),
 *  hairline divider between rows. */
export function DrawerFacts({ facts }: { facts: DrawerFact[] }) {
  return (
    <dl className="divide-y divide-line">
      {facts.map((f, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <dt className="flex min-w-0 items-center gap-2 text-muted">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-paper-muted text-ink">
              {f.icon}
            </span>
            <span className="truncate">{f.label}</span>
          </dt>
          <dd className="shrink-0 truncate pl-3 text-right font-medium">{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Collapsible block: native <details>/<summary> (no JS, no state to wire up)
 *  — title, optional count chip, chevron that flips via CSS on `[open]`. */
export { DrawerSection } from './drawer-section'

/** One linked-item row inside a DrawerSection: icon tile, title, a meta line
 *  split by thin `·` dividers, optional status pill. `href` makes the whole
 *  card a link (e.g. to the item's own record). */
export function DrawerItemCard({
  icon,
  title,
  meta = [],
  status,
  href,
}: {
  icon: ReactNode
  title: ReactNode
  meta?: ReactNode[]
  status?: ReactNode
  href?: string
}) {
  const inner = (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-paper-muted/40 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-paper text-muted">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        {meta.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {meta.map((m, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>·</span>}
                {m}
              </span>
            ))}
          </p>
        )}
      </div>
      {status}
    </div>
  )
  return href ? (
    <Link href={href} className="block transition hover:border-brand-300">
      {inner}
    </Link>
  ) : (
    inner
  )
}

/** Sticky Cancel + one primary action. Cancel is a plain Link that removes
 *  `view` from the URL — the same close mechanism a row's open-link already
 *  uses (RecordDrawer picks up the resulting `open=false` on re-render), so
 *  it needs no client state of its own. */
export function DrawerFooter({
  cancelHref,
  cancelLabel,
  primary,
}: {
  cancelHref: string
  cancelLabel: string
  primary?: { href: string; label: string; icon?: ReactNode }
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Link
        href={cancelHref}
        scroll={false}
        className="inline-flex h-10 max-sm:h-11 items-center rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-paper-muted"
      >
        {cancelLabel}
      </Link>
      {primary && (
        <Link
          href={primary.href}
          className="inline-flex h-10 max-sm:h-11 items-center gap-1.5 rounded-full bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
        >
          {primary.icon}
          {primary.label}
        </Link>
      )}
    </div>
  )
}
