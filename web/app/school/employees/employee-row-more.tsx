'use client'

import type { ReactNode } from 'react'
import { Popover } from '@base-ui/react/popover'
import { MoreVertical } from 'lucide-react'

/** The employee row's ⋮ (map 013, exam-landing pattern): a popover holding
 *  every action beyond the row's one contextual next step (full profile,
 *  attendance) — same shape as app/school/exams/exam-row-more.tsx. */
export function EmployeeRowMore({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={label}
        className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-paper-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        <MoreVertical className="size-4" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          <Popover.Popup
            aria-label={label}
            className="max-w-[min(92vw,32rem)] rounded-2xl border border-line bg-paper p-3 shadow-xl outline-none motion-safe:transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
