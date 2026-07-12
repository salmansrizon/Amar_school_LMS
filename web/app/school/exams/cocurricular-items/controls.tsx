'use client'

import { useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import type { CocurricularItem } from '@/lib/cocurricular'
import { addCocurricularItem, removeCocurricularItem } from './actions'

export function AddCocurricularItemForm({ lang }: { lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    startTransition(async () => {
      setError(null)
      const result = await addCocurricularItem(data)
      if (result.error) setError(result.error)
      else form.reset()
    })
  }

  return (
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={onSubmit}>
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="label">
          {t('cocurricular.label', lang)}
        </label>
        <input id="label" name="label" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="sort_order">
          {t('cocurricular.sortOrder', lang)}
        </label>
        <input id="sort_order" name="sort_order" type="number" defaultValue={0} className={inputClass} />
      </div>
      <div className="sm:col-span-3">
        <button type="submit" disabled={pending} className={primaryBtnClass}>
          {t('cocurricular.add', lang)}
        </button>
        {error && <p className="mt-2 text-sm text-alert-deep">{error}</p>}
      </div>
    </form>
  )
}

export function CocurricularItemsList({ items, lang }: { items: CocurricularItem[]; lang: Lang }) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  if (!items.length) return <p className="text-sm text-muted">{t('cocurricular.none', lang)}</p>

  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between py-2 text-sm">
          <span>
            {item.label} <span className="text-xs text-muted">#{item.sort_order}</span>
          </span>
          <button
            type="button"
            disabled={pendingId === item.id}
            onClick={() => {
              setPendingId(item.id)
              startTransition(async () => {
                await removeCocurricularItem(item.id)
                setPendingId(null)
              })
            }}
            className="cursor-pointer text-xs font-semibold text-alert-deep hover:underline disabled:opacity-50"
          >
            {t('cocurricular.delete', lang)}
          </button>
        </li>
      ))}
    </ul>
  )
}
