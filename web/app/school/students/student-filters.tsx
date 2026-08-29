'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { t, type Lang } from '@/lib/i18n'
import type { ClassCatalogueOption } from '@/lib/class-catalogue'

// Filters apply on change rather than behind a Filter button — the pattern every
// data-heavy SaaS console uses, and the reason the button is gone. The query
// string stays the source of truth, so the result is still linkable and the back
// button still works; only the round trip is client-driven.
//
// shadcn's Select is a client component, so the old `next/form` GET submission
// could not be kept as-is. `ALL` stands in for "no filter" because an empty
// string is not a legal Select item value.

const ALL = '__all__'

export function StudentFilters({
  q,
  classSection,
  combos,
  lang,
}: {
  q: string
  classSection: string
  combos: ClassCatalogueOption[]
  lang: Lang
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  // Base UI's Select emits null when its value is cleared, which means the same
  // thing here as picking "all".
  const apply = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString())
    if (!value || value === ALL) next.delete(key)
    else next.set(key, value)
    startTransition(() => router.push(`/school/students?${next.toString()}`))
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${pending ? 'opacity-70' : ''}`}>
      <Input
        name="q"
        defaultValue={q}
        placeholder={t('students.search', lang)}
        aria-label={t('students.search', lang)}
        className="w-64"
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply('q', (e.target as HTMLInputElement).value)
        }}
        onBlur={(e) => {
          if (e.target.value !== q) apply('q', e.target.value)
        }}
      />
      <Select value={classSection || ALL} onValueChange={(v) => apply('classSection', v)}>
        <SelectTrigger className="w-56" aria-label={t('students.classSection', lang)}>
          {/* Base UI renders the raw value unless the label is resolved here, so
              the sentinel would otherwise show as "__all__" in the trigger. */}
          <SelectValue>
            {(v) => (v === ALL ? t('students.allClasses', lang) : combos.find((c) => c.value === v)?.label ?? String(v))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('students.allClasses', lang)}</SelectItem>
          {combos.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
