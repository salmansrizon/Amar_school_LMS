'use client'

import * as React from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ComboboxFieldOption } from './combobox-field'

// The tiny-fixed-list twin of `ComboboxField` (≤5 static options: yes/no,
// present/absent, ...) — no type-to-filter, since there's nothing worth
// filtering, but styled with the exact same tokens so a page mixing both
// wrappers reads as one control family. Built directly on
// @base-ui/react/select (its own shadcn-flavoured wrapper, `ui/select.tsx` —
// `border-input`, `bg-popover`, ring-foreground/10 tokens — was a different
// design language with exactly one caller, `data-table/filters.tsx`; that
// caller now uses `ComboboxField` instead, so `ui/select.tsx` was deleted
// rather than kept around unused).
//
// Same hidden-input-for-form-submission story as ComboboxField: the
// primitive renders it itself for `name`, keyed off `{ value, label }`
// auto-detection, so `isItemEqualToValue` is the one thing this file still
// has to spell out (default comparison is `Object.is`).
const FIELD_BASE =
  'flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-line-strong bg-paper px-3 text-sm outline-none transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-300 data-disabled:cursor-not-allowed data-disabled:opacity-60 sm:min-h-10'

export interface SelectFieldProps {
  name?: string
  options: readonly ComboboxFieldOption[]
  defaultValue?: string | null
  value?: string | null
  onValueChange?: (value: string) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  id?: string
  className?: string
  'aria-label'?: string
}

export function SelectField({
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
  'aria-label': ariaLabel,
}: SelectFieldProps) {
  const isControlled = value !== undefined
  const resolvedValue = isControlled ? (options.find((o) => o.value === value) ?? null) : undefined
  const resolvedDefault =
    !isControlled && defaultValue != null ? (options.find((o) => o.value === defaultValue) ?? null) : undefined

  return (
    <SelectPrimitive.Root
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
      <SelectPrimitive.Trigger id={id} aria-label={ariaLabel} className={cn(FIELD_BASE, className)}>
        <SelectPrimitive.Value placeholder={placeholder} className="flex-1 truncate text-left" />
        <SelectPrimitive.Icon
          render={<ChevronDownIcon className="size-4 shrink-0 text-muted" />}
        />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner sideOffset={4} className="z-50 outline-none">
          <SelectPrimitive.Popup className="w-(--anchor-width) max-w-(--available-width) overflow-hidden rounded-md border border-line bg-paper shadow-card">
            <SelectPrimitive.List className="max-h-[min(16rem,var(--available-height))] overflow-y-auto overscroll-contain py-1">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option}
                  disabled={option.disabled}
                  className="mx-1 cursor-default rounded-sm px-2 py-1.5 text-sm text-ink outline-none select-none data-highlighted:bg-brand-50 data-highlighted:text-brand-700 data-disabled:pointer-events-none data-disabled:opacity-50"
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
