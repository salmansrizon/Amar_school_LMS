'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
        <Input
          id="data-table-search"
          type="search"
          defaultValue={params.get(searchParam) ?? ''}
          placeholder={search.placeholder}
          aria-label={search.placeholder}
          className="w-full md:w-72"
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
          <Select key={f.param} value={value} onValueChange={(v) => apply(f.param, v as string | null)}>
            <SelectTrigger
              id={i === 0 ? 'data-table-filter' : undefined}
              className="w-full md:w-auto md:min-w-44"
              aria-label={f.label}
            >
              <SelectValue>
                {(v) => (v === ALL ? `${t('table.all', lang)} ${f.label}` : f.options.find((o) => o.value === v)?.label ?? String(v))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{`${t('table.all', lang)} ${f.label}`}</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      })}
    </div>
  )
}
