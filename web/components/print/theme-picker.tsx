'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { inputClass } from '@/components/auth-card'
import { PRINT_THEMES } from '@/lib/print-themes'
import type { Lang } from '@/lib/i18n'

// Per-print colour override (issue #94, map #91): the school's saved default
// applies unless this run says otherwise, so the choice lives in the URL and
// persists nothing. Same navigation shape as TemplatePicker, but it preserves
// the other params — template and theme are independent choices.

export function ThemePicker({
  selected,
  label,
  lang,
}: {
  selected: string
  label: string
  lang: Lang
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
        next.set('theme', e.target.value)
        router.push(`${pathname}?${next.toString()}`)
      }}
      className={`${inputClass} max-w-48 print:hidden`}
    >
      {PRINT_THEMES.map((theme) => (
        <option key={theme.key} value={theme.key}>
          {theme.label[lang]}
        </option>
      ))}
    </select>
  )
}
