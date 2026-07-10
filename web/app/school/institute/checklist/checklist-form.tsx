'use client'

import { useState, useTransition } from 'react'
import { primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { CHECKLIST_ITEMS, type ChecklistItemKey } from '@/lib/institute'
import { saveChecklist } from './actions'

export function ChecklistForm({
  lang,
  date,
  row,
}: {
  lang: Lang
  date: string
  row: Record<ChecklistItemKey, boolean> | null
}) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      setError(null)
      setSaved(false)
      const result = await saveChecklist(data)
      if (result.error) setError(result.error)
      else setSaved(true)
    })
  }

  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="checklist_date" value={date} />
      <div className="grid gap-2">
        {CHECKLIST_ITEMS.map((item) => (
          <label key={item.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={item.key} defaultChecked={row?.[item.key] ?? false} />
            {item.label[lang]}
          </label>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-alert-deep">{error}</p>}
      {saved && !error && <p className="mt-3 text-sm text-mint-deep">{t('institute.saved', lang)}</p>}
      <button type="submit" disabled={pending} className={`${primaryBtnClass} mt-4 w-auto px-6`}>
        {t('institute.save', lang)}
      </button>
    </form>
  )
}
