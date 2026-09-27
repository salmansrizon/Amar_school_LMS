'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { inputBaseClass } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ComboboxField } from '@/components/ui/combobox-field'
import { t, type Lang } from '@/lib/i18n'
import { withParams } from '@/lib/url-params'

// Filters apply on change; the query string stays the source of truth.

export type FilterDef = {
  param: string
  label: string
  options: { value: string; label: string }[]
}

const ALL = '__all__'

export function DataTableFilters({
  search,
  filters = [],
  lang,
}: {
  search?: { param?: string; placeholder: string }
  filters?: FilterDef[]
  lang: Lang
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const searchParam = search?.param ?? 'q'

  const apply = (key: string, value: string | null) => {
    const current = Object.fromEntries(params.entries())
    const next = withParams(current, { [key]: value === ALL ? null : value })
    startTransition(() => router.replace(`${pathname}${next}`, { scroll: false }))
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${pending ? 'opacity-70' : ''}`}>
      {search && (
        // A plain <input>, not the base-ui Input: its default tracks the URL, and
        // opening a row's route popup swaps the URL under the still-mounted list.
        // base-ui logs an error when an uncontrolled control's default changes;
        // React just keeps what's typed.
        <input
          id="data-table-search"
          type="search"
          defaultValue={params.get(searchParam) ?? ''}
          placeholder={search.placeholder}
          aria-label={search.placeholder}
          className={cn(inputBaseClass, 'w-full md:w-72')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply(searchParam, e.currentTarget.value)
          }}
          onBlur={(e) => {
            if (e.target.value !== (params.get(searchParam) ?? '')) apply(searchParam, e.target.value)
          }}
        />
      )}
      {filters.map((f, i) => {
        const value = params.get(f.param) || ALL
        return (
          <ComboboxField
            key={f.param}
            id={i === 0 ? 'data-table-filter' : undefined}
            className="w-full md:w-auto md:min-w-44"
            aria-label={f.label}
            value={value}
            onValueChange={(v) => apply(f.param, v)}
            options={[
              { value: ALL, label: `${t('table.all', lang)} ${f.label}` },
              ...f.options,
            ]}
          />
        )
      })}
    </div>
  )
}
