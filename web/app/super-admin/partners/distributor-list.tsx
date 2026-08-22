'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { EntityAvatar } from '@/components/entity-avatar'

export type DistributorRow = { id: string; full_name: string | null }

// Master-detail left column (#416): client search + a selectable list. Picking a
// row sets ?selected=<id> so the server renders the matching summary pane on the
// right — no client data fetch, shareable + reload-stable.
export function DistributorList({
  distributors,
  selectedId,
  lang,
}: {
  distributors: DistributorRow[]
  selectedId: string | null
  lang: Lang
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return distributors
    return distributors.filter((d) => (d.full_name ?? d.id).toLowerCase().includes(needle))
  }, [distributors, q])

  function select(id: string) {
    const p = new URLSearchParams(params.toString())
    p.set('selected', id)
    router.replace(`?${p.toString()}`)
  }

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('partners.search', lang)}
        className="mb-3 h-9 w-full rounded-full border border-line-strong bg-paper px-3 text-sm outline-none focus:border-brand-500"
      />
      <ul className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto">
        {filtered.map((d) => {
          const active = d.id === selectedId
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => select(d.id)}
                aria-current={active}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
                  active ? 'bg-brand-50 ring-1 ring-brand-500' : 'hover:bg-paper-muted'
                }`}
              >
                <EntityAvatar name={d.full_name ?? '?'} id={d.id} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{d.full_name ?? d.id}</span>
                  <span className="block truncate text-[11px] text-muted">{t('partners.distributor', lang)}</span>
                </span>
                <span className="text-muted" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          )
        })}
        {filtered.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted">—</li>}
      </ul>
    </div>
  )
}
