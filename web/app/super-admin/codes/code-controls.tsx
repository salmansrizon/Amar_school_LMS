'use client'

import { useState, useTransition } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { deleteCode, generateBatch } from './actions'

const input =
  'h-9 w-full rounded-sm border border-line-strong bg-paper px-2 text-sm outline-none focus:border-brand-500'
const label = 'mb-1 block text-xs font-semibold text-muted'

export function GenerateBatchForm({ lang }: { lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const result = await generateBatch(data)
          if (result.error) setError(result.error)
          else form.reset()
        })
      }}
    >
      <div>
        <label className={label} htmlFor="count">{t('codes.count', lang)}</label>
        <input id="count" name="count" type="number" min={1} max={50} defaultValue={5} required className={input} />
      </div>
      <div>
        <label className={label} htmlFor="validity">{t('codes.validity', lang)}</label>
        <input id="validity" name="validity" type="number" min={1} max={24} defaultValue={12} required className={input} />
      </div>
      <div>
        <label className={label} htmlFor="price">{t('codes.price', lang)}</label>
        <input id="price" name="price" type="number" min={0} step="0.01" defaultValue={0} required className={input} />
      </div>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={pending}
          className="h-9 w-full cursor-pointer rounded-full bg-brand-500 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {t('codes.generate', lang)}
        </button>
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
    </form>
  )
}

export function DeleteCodeButton({ id, label: text }: { id: string; label: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-alert-deep">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteCode(id)
            setError(result.error ?? null)
          })
        }
        className="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      >
        {text}
      </button>
    </span>
  )
}
