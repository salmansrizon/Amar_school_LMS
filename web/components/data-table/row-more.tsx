'use client'

import { useState, type ReactNode } from 'react'
import { Popover } from '@base-ui/react/popover'
import { MoreVertical } from 'lucide-react'

/** A row's ⋮ (map 013, exam-landing pattern): a popover holding every action
 *  beyond the row's one contextual next step.
 *
 *  Any action inside closes it, so it never sits over the popup that action
 *  opened. It stays mounted (hidden) meanwhile: dialogs its children own
 *  (Exam Documents, ID-card print) live in this subtree and must survive the
 *  popover closing. */
export function RowMore({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={label}
        className='inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-paper-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300'
      >
        <MoreVertical className='size-4' aria-hidden />
      </Popover.Trigger>
      <Popover.Portal keepMounted>
        <Popover.Positioner
          side='bottom'
          align='end'
          sideOffset={6}
          className='z-50'
        >
          <Popover.Popup
            aria-label={label}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a,button')) setOpen(false)
            }}
            className='max-w-[min(92vw,56rem)] rounded-2xl border border-line bg-paper p-3 shadow-xl outline-none motion-safe:transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0'
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
