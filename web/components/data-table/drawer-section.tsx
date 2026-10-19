'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/** A collapsible block inside a record drawer. A button with `aria-expanded`,
 *  not `<details>`: inside the drawer a click on a `<summary>` never toggled a
 *  section that started closed ("Full profile"), so the section could not be
 *  opened at all. */
export function DrawerSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string
  count?: number
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className="border-t border-line py-3 first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-md py-1 text-left text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        <span className="flex items-center gap-2">
          {title}
          {count !== undefined && (
            <span className="rounded-full bg-paper-muted px-2 py-0.5 text-xs font-semibold text-muted">{count}</span>
          )}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      <div id={id} hidden={!open} className="pt-3">
        {children}
      </div>
    </section>
  )
}
