import Link from 'next/link'
import type { ReactNode } from 'react'

// A compact pill-style nav, one step down from SectionTabs' underline tabs —
// for a sub-nav or a view switch that needs to sit beside other controls in
// the same toolbar row rather than own a full-width underlined row (calendar
// polish, map 013 follow-up). Links, not a client-side tablist: same
// reasoning as SectionTabs (components/ui/section-tabs.tsx) — each item is
// its own URL, not a JS-managed panel switch.

export interface SegmentedControlItem {
  href: string
  label: string
  icon?: ReactNode
  /** Hide the label below `sm`, showing only the icon — for icon-first
   *  switches (Calendar/Table) where toolbar space is tight. The label stays
   *  in aria-label regardless, so the accessible name never depends on
   *  viewport width (E2E and screen readers both get it every time). */
  iconOnlyOnMobile?: boolean
}

export function SegmentedControl({
  items,
  active,
  ariaLabel,
}: {
  items: readonly SegmentedControlItem[]
  /** The href of the current item. */
  active: string
  /** Accessible name for the group landmark. */
  ariaLabel: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-line bg-paper p-0.5"
    >
      {items.map((item) => {
        const current = item.href === active
        return (
          <Link
            key={item.href}
            href={item.href}
            scroll={false}
            aria-current={current ? 'page' : undefined}
            aria-label={item.icon ? item.label : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              current ? 'bg-brand-500 text-white shadow-sm' : 'text-muted hover:bg-paper-muted hover:text-ink'
            }`}
          >
            {item.icon}
            <span className={item.icon && item.iconOnlyOnMobile ? 'hidden sm:inline' : undefined}>{item.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
