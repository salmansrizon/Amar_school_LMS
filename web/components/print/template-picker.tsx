'use client'

import { usePathname, useRouter } from 'next/navigation'
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
  return (
    <select
      value={selected}
      aria-label={label}
      onChange={(e) => router.push(`${pathname}?template=${e.target.value}`)}
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
