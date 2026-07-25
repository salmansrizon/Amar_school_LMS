'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass } from '@/components/auth-card'
import { dateInputClass } from '@/components/ui/field'
import { t, type Lang } from '@/lib/i18n'
import { addCentralOffDay, deleteCentralOffDay } from './actions'

const btn =
  'h-9 cursor-pointer rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50'

export function AddCentralOffDayForm({ lang }: { lang: Lang }) {
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
          const result = await addCentralOffDay(data)
          if (result.error) setError(result.error)
          else form.reset()
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor="day">{t('sa.offday.date', lang)}</label>
        <input id="day" name="day" type="date" required className={dateInputClass({ size: 'md', fullWidth: true })} />
      </div>
      <div>
        <label className={labelClass} htmlFor="label_bn">{t('sa.offday.labelBn', lang)}</label>
        <input id="label_bn" name="label_bn" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="label_en">{t('sa.offday.labelEn', lang)}</label>
        <input id="label_en" name="label_en" className={inputClass} />
      </div>
      <button type="submit" disabled={pending} className={btn}>{t('sa.offday.add', lang)}</button>
      {error && <span className="text-xs text-alert-deep">{error}</span>}
    </form>
  )
}

export function DeleteCentralOffDayButton({ id, lang }: { id: string; lang: Lang }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await deleteCentralOffDay(id)
          router.refresh()
        })
      }
      className="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
    >
      {t('sa.offday.delete', lang)}
    </button>
  )
}
