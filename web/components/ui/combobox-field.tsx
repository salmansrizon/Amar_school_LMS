'use client'

import * as React from 'react'
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// The "text dynamic" dropdown — type-to-filter replacement for a native
// `<select>` wherever the option list is long or data-driven (classes,
// students, teachers, subjects, exams, years, categories, ...). Built on
// @base-ui/react/combobox, the "selected item" sibling of the free-text
// Autocomplete `ui/combobox.tsx` already uses for the Subject suggestions
// field (that one's whole point is a plain input with *optional* matches;
// this one models exactly what a `<select>` does — one committed value).
//
// The primitive renders its own hidden `<input name>` for form submission
// (see AriaCombobox's `hiddenInputs`), so every call site keeps posting
// FormData / server actions unchanged just by keeping the same `name`.
//
// `options` always carries `{ value, label }` — base-ui auto-derives the
// display string from `.label` and the submitted string from `.value` for
// that exact shape (`itemToStringLabel` / `itemToStringValue` defaults), so
// this file never has to supply either. `isItemEqualToValue` still has to be
// explicit: the default comparison is `Object.is`, and the object handed
// back as `value`/`defaultValue` needs to compare equal to the matching
// object inside `options` even though nothing guarantees they're the same
// reference.
export interface ComboboxFieldOption {
  value: string
  label: string
  disabled?: boolean
}

// Mirrors the app's mobile-tap-target convention (`min-h-11` down to the
// desktop height at `sm:`, e.g. `components/ui/button.tsx`), styled with the
// same "Family design system" tokens as the existing free-text Combobox so
// every converted dropdown looks the same regardless of which wrapper it uses.
const FIELD_BASE =
  'flex min-h-11 w-full items-stretch rounded-md border border-line-strong bg-paper text-sm outline-none transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-300 data-disabled:cursor-not-allowed data-disabled:opacity-60 sm:min-h-10'

export interface ComboboxFieldProps {
  name?: string
  options: readonly ComboboxFieldOption[]
  /** Uncontrolled initial value, matching a native `<select defaultValue>`. */
  defaultValue?: string | null
  /** Controlled value; pass alongside `onValueChange`, matching a native
   *  `<select value onChange>`. */
  value?: string | null
  onValueChange?: (value: string) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  id?: string
  className?: string
  inputClassName?: string
  /** Shown in the popup when typing matches nothing. */
  emptyText?: string
  'aria-label'?: string
}

export function ComboboxField({
  name,
  options,
  defaultValue,
  value,
  onValueChange,
  placeholder,
  required,
  disabled,
  id,
  className,
  inputClassName,
  emptyText = 'No matches',
  'aria-label': ariaLabel,
}: ComboboxFieldProps) {
  const isControlled = value !== undefined
  const resolvedValue = isControlled ? (options.find((o) => o.value === value) ?? null) : undefined
  const resolvedDefault =
    !isControlled && defaultValue != null ? (options.find((o) => o.value === defaultValue) ?? null) : undefined

  return (
    <ComboboxPrimitive.Root
      items={options}
      name={name}
      required={required}
      disabled={disabled}
      value={resolvedValue}
      defaultValue={resolvedDefault}
      onValueChange={
        onValueChange ? (item: ComboboxFieldOption | null) => onValueChange(item?.value ?? '') : undefined
      }
      isItemEqualToValue={(a: ComboboxFieldOption, b: ComboboxFieldOption) => a?.value === b?.value}
    >
      <ComboboxPrimitive.InputGroup className={cn(FIELD_BASE, className)}>
        <ComboboxPrimitive.Input
          id={id}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className={cn('h-full min-w-0 flex-1 rounded-l-md bg-transparent px-3 outline-none', inputClassName)}
        />
        {/* Decorative mouse affordance only — the Input beside it already carries
            the full ARIA combobox pattern (and, per base-ui's default
            `openOnInputClick`, already opens the same popup on click). Base UI's
            Trigger independently grows a `role="combobox"` of its own (its
            "input inside popup" pattern's surface), which would otherwise give
            this one logical field two same-named combobox landmarks — one
            genuine, one a decoy that claims (wrongly, for this layout) to open
            a dialog. aria-hidden + tabIndex=-1 keep it out of the accessibility
            tree and tab order without touching its click handler. */}
        <ComboboxPrimitive.Trigger
          aria-hidden="true"
          tabIndex={-1}
          className="flex shrink-0 cursor-pointer items-center rounded-r-md px-2 text-muted outline-none hover:text-ink data-disabled:cursor-not-allowed"
        >
          <ChevronDownIcon className="size-4" />
        </ComboboxPrimitive.Trigger>
      </ComboboxPrimitive.InputGroup>
      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner sideOffset={4} className="z-50 outline-none">
          <ComboboxPrimitive.Popup className="w-(--anchor-width) max-w-(--available-width) overflow-hidden rounded-md border border-line bg-paper shadow-card">
            <ComboboxPrimitive.Empty className="px-3 py-2 text-sm text-muted">{emptyText}</ComboboxPrimitive.Empty>
            <ComboboxPrimitive.List className="max-h-[min(16rem,var(--available-height))] overflow-y-auto overscroll-contain py-1 empty:p-0">
              {(option: ComboboxFieldOption) => (
                <ComboboxPrimitive.Item
                  key={option.value}
                  value={option}
                  disabled={option.disabled}
                  className="mx-1 cursor-default rounded-sm px-2 py-1.5 text-sm text-ink outline-none select-none data-highlighted:bg-brand-50 data-highlighted:text-brand-700 data-disabled:pointer-events-none data-disabled:opacity-50"
                >
                  {option.label}
                </ComboboxPrimitive.Item>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  )
}
