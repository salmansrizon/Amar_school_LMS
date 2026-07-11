'use client'

import { useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { logSatisfactionRating } from '../actions'

export function LogRatingForm({ lang }: { lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const result = await logSatisfactionRating(data)
          if (result.error) setError(result.error)
          else form.reset()
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor="overall_rating">{t('feedback.overallRating', lang)}</label>
        <input
          id="overall_rating"
          name="overall_rating"
          type="number"
          min={1}
          max={5}
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="category_teaching">{t('feedback.categoryTeaching', lang)}</label>
        <input id="category_teaching" name="category_teaching" type="number" min={1} max={5} className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="category_facilities">{t('feedback.categoryFacilities', lang)}</label>
        <input id="category_facilities" name="category_facilities" type="number" min={1} max={5} className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="category_communication">{t('feedback.categoryCommunication', lang)}</label>
        <input id="category_communication" name="category_communication" type="number" min={1} max={5} className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="category_safety">{t('feedback.categorySafety', lang)}</label>
        <input id="category_safety" name="category_safety" type="number" min={1} max={5} className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="sender_name">{t('feedback.optionalName', lang)}</label>
        <input id="sender_name" name="sender_name" className={inputClass} />
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-3">{error}</p>}
      <button type="submit" disabled={pending} className={`${primaryBtnClass} sm:col-span-3`}>
        {t('feedback.logRating', lang)}
      </button>
    </form>
  )
}
