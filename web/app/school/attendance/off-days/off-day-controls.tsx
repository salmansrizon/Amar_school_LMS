'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { addOffDay, deleteOffDay } from '../manual-actions'
import { dateInputClass } from '@/components/ui/field'

export function AddOffDayForm({ lang }: { lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const result = await addOffDay(data)
          if (result.error) setError(result.error)
          else form.reset()
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor="day">
          {t('attendance.offDayDate', lang)}
        </label>
        <input id="day" name="day" type="date" required className={dateInputClass({ size: 'md', fullWidth: true })} />
      </div>
      <div>
        <label className={labelClass} htmlFor="label">
          {t('attendance.offDayLabelField', lang)}
        </label>
        <input id="label" name="label" className={inputClass} />
      </div>
      <label className="flex h-10 items-center gap-2 text-sm">
        <input type="checkbox" name="is_significant" />
        {t('attendance.offDaySignificant', lang)}
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-10 cursor-pointer rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {t('common.add', lang)}
      </button>
      {error && <p className="w-full text-sm text-alert-deep">{error}</p>}
    </form>
  )
}

export function DeleteOffDayButton({ day, lang }: { day: string; lang: Lang }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-alert-deep">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteOffDay(day)
            if (result.error) setError(result.error)
            else router.refresh()
          })
        }
        className="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      >
        {t('common.delete', lang)}
      </button>
    </span>
  )
}
