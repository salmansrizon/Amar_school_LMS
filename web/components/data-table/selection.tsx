'use client'

import { createContext, useContext, useState } from 'react'
import { t, type Lang } from '@/lib/i18n'

export type BulkAction = {
  label: string
  /** Server action; receives FormData with every selected id under `ids`. */
  action: (formData: FormData) => void | Promise<void>
  tone?: 'primary' | 'danger'
}

type Ctx = { ids: string[]; selected: Set<string>; toggle: (id: string) => void; setAll: (on: boolean) => void }
const SelectionCtx = createContext<Ctx | null>(null)

function useSelection() {
  const ctx = useContext(SelectionCtx)
  if (!ctx) throw new Error('Selection components must sit inside <SelectionProvider>')
  return ctx
}

export function SelectionProvider({ ids, children }: { ids: string[]; children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const setAll = (on: boolean) => setSelected(on ? new Set(ids) : new Set())
  return <SelectionCtx.Provider value={{ ids, selected, toggle, setAll }}>{children}</SelectionCtx.Provider>
}

const box = 'size-4 accent-brand-500'
// A bare 16px checkbox is a 16px target. The label is the 44px hit area on a phone.
const hit = 'inline-flex cursor-pointer items-center justify-center max-sm:size-11'

export function SelectAll({ lang }: { lang: Lang }) {
  const { ids, selected, setAll } = useSelection()
  const all = ids.length > 0 && selected.size === ids.length
  return (
    <label className={hit}>
      <input
        type="checkbox"
        className={box}
        aria-label={t('table.selectAll', lang)}
        checked={all}
        ref={(el) => {
          if (el) el.indeterminate = selected.size > 0 && !all
        }}
        onChange={(e) => setAll(e.target.checked)}
      />
    </label>
  )
}

export function RowCheck({ id, label }: { id: string; label: string }) {
  const { selected, toggle } = useSelection()
  return (
    <label className={hit}>
      <input type="checkbox" className={box} aria-label={label} checked={selected.has(id)} onChange={() => toggle(id)} />
    </label>
  )
}

export function BulkBar({ actions, lang }: { actions: BulkAction[]; lang: Lang }) {
  const { selected, setAll } = useSelection()
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        selected.size
          ? 'mb-grid flex flex-wrap items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-card py-2'
          : 'sr-only'
      }
    >
      {selected.size > 0 && (
        <>
          <span className="text-sm font-semibold">
            {selected.size} {t('table.selected', lang)}
          </span>
          {actions.map((a) => (
            <form key={a.label} action={a.action}>
              {[...selected].map((id) => (
                <input key={id} type="hidden" name="ids" value={id} />
              ))}
              <button
                className={`inline-flex h-9 items-center rounded-full px-4 text-xs font-semibold ${
                  a.tone === 'danger'
                    ? 'bg-alert-soft text-alert-deep hover:bg-alert-soft/70'
                    : 'bg-brand-500 text-white hover:bg-brand-600'
                }`}
              >
                {a.label}
              </button>
            </form>
          ))}
          <button
            type="button"
            onClick={() => setAll(false)}
            className="ml-auto text-xs font-semibold text-muted hover:text-ink"
          >
            {t('table.clearSelection', lang)}
          </button>
        </>
      )}
    </div>
  )
}
