'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { inputClass } from '@/components/auth-card'

// Mark sheet / progress report template switcher (mark-sheet-preview.html /
// progress-report-preview.html's topbar <select>) — mirrors marks-entry's
// SubjectPicker: changing the value navigates ?template=N so the print page
// itself decides how to render, no client-side template state to keep in
// sync with the server-rendered data.

export function TemplatePicker({
  selected,
  label,
  options,
}: {
  selected: 1 | 2 | 3
  label: string
  options: [string, string, string]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  return (
    <select
      value={selected}
      aria-label={label}
      onChange={(e) => {
        const next = new URLSearchParams(searchParams.toString())
        next.set('template', e.target.value)
        router.push(`${pathname}?${next.toString()}`)
      }}
      className={`${inputClass} max-w-48 print:hidden`}
    >
      {options.map((label, i) => (
        <option key={label} value={i + 1}>
          {label}
        </option>
      ))}
    </select>
  )
}

/** 2-option variant (admit card, issue #48 — only 2 templates per the
 * ticket) — same ?template=N navigation, a distinct type rather than loosening
 * TemplatePicker's tuple so mark-sheet/progress-report keep their 3-way check. */
export function TemplatePicker2({
  selected,
  label,
  options,
}: {
  selected: 1 | 2
  label: string
  options: [string, string]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  return (
    <select
      value={selected}
      aria-label={label}
      onChange={(e) => {
        const next = new URLSearchParams(searchParams.toString())
        next.set('template', e.target.value)
        router.push(`${pathname}?${next.toString()}`)
      }}
      className={`${inputClass} max-w-48 print:hidden`}
    >
      {options.map((label, i) => (
        <option key={label} value={i + 1}>
          {label}
        </option>
      ))}
    </select>
  )
}
