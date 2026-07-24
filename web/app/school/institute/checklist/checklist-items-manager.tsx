'use client'

import { useState, useTransition } from 'react'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { itemLabel, type ActivityChecklistItem } from '@/lib/institute'
import {
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  moveChecklistItem,
} from './actions'

// Activity Checklist template editor (ui.md issue 4 / #150): school owners add,
// rename, reorder and remove the checklist items the dashboard shows each day.
// Server actions revalidate this page and /school, so the list and the
// dashboard both refresh after any change.

const inputClass =
  'h-9 rounded-md border border-line-strong bg-paper px-3 text-sm text-ink outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-300'

/** Known validation keys translate; anything else (a raw DB error) shows as-is. */
function message(err: string, lang: Lang): string {
  const known: Record<string, MessageKey> = {
    checklistItemLabelRequired: 'institute.checklistItemLabelRequired',
  }
  return known[err] ? t(known[err], lang) : err
}

function ItemRow({
  lang,
  item,
  isFirst,
  isLast,
}: {
  lang: Lang
  item: ActivityChecklistItem
  isFirst: boolean
  isLast: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      setError(null)
      const result = await fn()
      if (result.error) setError(message(result.error, lang))
      else setEditing(false)
    })

  const onEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    run(() => updateChecklistItem(data))
  }

  return (
    <li className="rounded-md border border-line bg-paper p-3">
      {editing ? (
        <form onSubmit={onEditSubmit} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={item.id} />
          <input
            name="label_en"
            defaultValue={item.label_en}
            placeholder={t('institute.checklistLabelEn', lang)}
            className={`${inputClass} min-w-40 flex-1`}
          />
          <input
            name="label_bn"
            defaultValue={item.label_bn}
            placeholder={t('institute.checklistLabelBn', lang)}
            className={`${inputClass} min-w-40 flex-1`}
          />
          <button
            type="submit"
            disabled={pending}
            className="cursor-pointer rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {t('institute.save', lang)}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false)
              setError(null)
            }}
            className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('institute.cancel', lang)}
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">{itemLabel(item, lang)}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t('institute.checklistMoveUp', lang)}
              disabled={isFirst || pending}
              onClick={() => run(() => moveChecklistItem(item.id, 'up'))}
              className="cursor-pointer rounded-md border border-line px-2 py-1 text-xs font-semibold hover:bg-paper-muted disabled:opacity-40"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={t('institute.checklistMoveDown', lang)}
              disabled={isLast || pending}
              onClick={() => run(() => moveChecklistItem(item.id, 'down'))}
              className="cursor-pointer rounded-md border border-line px-2 py-1 text-xs font-semibold hover:bg-paper-muted disabled:opacity-40"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
            >
              {t('institute.edit', lang)}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm(t('institute.checklistDeleteConfirm', lang))) run(() => deleteChecklistItem(item.id))
              }}
              className="cursor-pointer rounded-full border border-alert-deep/40 px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
            >
              {t('common.delete', lang)}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-alert-deep">{error}</p>}
    </li>
  )
}

export function ChecklistItemsManager({ lang, items }: { lang: Lang; items: ActivityChecklistItem[] }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const onAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    startTransition(async () => {
      setError(null)
      const result = await addChecklistItem(data)
      if (result.error) setError(message(result.error, lang))
      else form.reset()
    })
  }

  return (
    <div>
      <ul className="mb-4 grid gap-2">
        {items.map((item, i) => (
          <ItemRow
            key={item.id}
            lang={lang}
            item={item}
            isFirst={i === 0}
            isLast={i === items.length - 1}
          />
        ))}
        {!items.length && <li className="text-sm text-muted">{t('institute.checklistNoItems', lang)}</li>}
      </ul>

      <form onSubmit={onAdd} className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <input
          name="label_en"
          placeholder={t('institute.checklistLabelEn', lang)}
          className={`${inputClass} min-w-40 flex-1`}
        />
        <input
          name="label_bn"
          placeholder={t('institute.checklistLabelBn', lang)}
          className={`${inputClass} min-w-40 flex-1`}
        />
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {t('institute.checklistAddItem', lang)}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-alert-deep">{error}</p>}
    </div>
  )
}
