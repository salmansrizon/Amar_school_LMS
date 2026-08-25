'use client'

import * as React from 'react'
import { Autocomplete } from '@base-ui/react/autocomplete'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// A free-typeable text field with a styled, scrollable suggestion dropdown
// (issue #504, follow-on to #503's subject picker, which used a native
// `<input list> + <datalist>` — a browser-chrome popup that isn't
// consistently scrollable or stylable). Built on @base-ui/react/autocomplete
// rather than its sibling `Combobox` primitive: Autocomplete's whole point
// (per its own docs) is a plain free-form input with *optional* suggestions,
// where Combobox instead models a required "selected item". Styled to match
// this screen's native `<select>`s (field.ts's selectClass tokens, the
// "Family design system" — issue #119) rather than the newer shadcn-based
// `select.tsx`, since that's what the Class picker beside it still uses.

const FIELD_BASE =
  'flex h-10 w-full items-stretch rounded-md border border-line-strong bg-paper text-sm outline-none transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-300'

/** The root — carries `items`, `name`/`required` (for native form
 *  submission, same as a plain `<input name>`), and `defaultValue`. */
export function Combobox<Value extends string>({
  items,
  openOnInputClick = true,
  ...props
}: Autocomplete.Root.Props<Value> & { items: readonly Value[] }) {
  return <Autocomplete.Root items={items} openOnInputClick={openOnInputClick} {...props} />
}

export function ComboboxInputGroup({ className, ...props }: Autocomplete.InputGroup.Props) {
  return <Autocomplete.InputGroup className={cn(FIELD_BASE, className)} {...props} />
}

export function ComboboxInput({ className, ...props }: Autocomplete.Input.Props) {
  return (
    <Autocomplete.Input
      className={cn('h-full min-w-0 flex-1 rounded-l-md bg-transparent px-3 outline-none', className)}
      {...props}
    />
  )
}

export function ComboboxTrigger({ className, ...props }: Autocomplete.Trigger.Props) {
  return (
    <Autocomplete.Trigger
      className={cn(
        'flex shrink-0 cursor-pointer items-center rounded-r-md px-2 text-muted outline-none hover:text-ink',
        className,
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </Autocomplete.Trigger>
  )
}

/** The dropdown: portalled, positioned against the input group, with the
 *  scrollbar on the list itself (mirrors Base UI's own docs examples) so the
 *  popup's rounded corners stay clean regardless of item count. `children` is
 *  the per-item render function, same shape as `Autocomplete.List`'s. */
export function ComboboxPopup({
  className,
  listClassName,
  empty,
  children,
}: {
  className?: string
  listClassName?: string
  empty?: React.ReactNode
  children: Extract<Autocomplete.List.Props['children'], (...args: never[]) => unknown>
}) {
  return (
    <Autocomplete.Portal>
      <Autocomplete.Positioner sideOffset={4} className="z-50 outline-none">
        <Autocomplete.Popup
          className={cn(
            'w-(--anchor-width) max-w-(--available-width) overflow-hidden rounded-md border border-line bg-paper shadow-card',
            className,
          )}
        >
          {empty !== undefined && (
            <Autocomplete.Empty className="px-3 py-2 text-sm text-muted">{empty}</Autocomplete.Empty>
          )}
          <Autocomplete.List
            className={cn(
              'max-h-[min(16rem,var(--available-height))] overflow-y-auto overscroll-contain py-1 empty:p-0',
              listClassName,
            )}
          >
            {children}
          </Autocomplete.List>
        </Autocomplete.Popup>
      </Autocomplete.Positioner>
    </Autocomplete.Portal>
  )
}

export function ComboboxItem({ className, ...props }: Autocomplete.Item.Props) {
  return (
    <Autocomplete.Item
      className={cn(
        'mx-1 cursor-default rounded-sm px-2 py-1.5 text-sm text-ink outline-none select-none data-highlighted:bg-brand-50 data-highlighted:text-brand-700',
        className,
      )}
      {...props}
    />
  )
}
