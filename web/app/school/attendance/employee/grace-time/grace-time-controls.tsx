'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { EMPLOYEE_CATEGORIES, EMPLOYEE_CATEGORY_LABEL_KEY } from '@/lib/employees'
import { dateInputClass } from '@/components/ui/field'
import { setDefaultGrace, setCategoryGrace, addAdHocGraceExemption } from './actions'

const input =
  'h-9 w-full rounded-sm border border-line-strong bg-paper px-2 text-sm outline-none focus:border-brand-500'
const label = 'mb-1 block text-xs font-semibold text-muted'
const btn =
  'h-9 cursor-pointer rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50'

function useAction(action: (data: FormData) => Promise<{ error?: string }>) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    startTransition(async () => {
      setError(null)
      const result = await action(data)
      if (result.error) setError(result.error)
      else form.reset()
    })
  }
  return { error, pending, submit }
}

export function DefaultGraceForm({ current, lang }: { current: number | null; lang: Lang }) {
  const { error, pending, submit } = useAction(setDefaultGrace)
  return (
    <form onSubmit={submit}>
      <label className={label} htmlFor="default_grace">{t('grace.global', lang)}</label>
      <div className="flex gap-2">
        <input id="default_grace" name="minutes" type="number" min={0} defaultValue={current ?? ''} className={input} />
        <button type="submit" disabled={pending} className={btn}>{t('schools.apply', lang)}</button>
      </div>
      {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
    </form>
  )
}

// Grace and Prayer & Tiffin Window are two independent columns on the same
// (school_id, category) row (issue #671) — one combined form/submit, not two,
// since setting one shouldn't require re-typing the other's already-saved value.
export function CategoryGraceForm({ lang }: { lang: Lang }) {
  const { error, pending, submit } = useAction(setCategoryGrace)
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div>
        <label className={label}>{t('employees.category', lang)}</label>
        <select name="category" required defaultValue="" className={input} aria-label={t('employees.category', lang)}>
          <option value="" disabled>{t('employees.category', lang)}</option>
          {EMPLOYEE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{t(EMPLOYEE_CATEGORY_LABEL_KEY[c], lang)}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={label}>{t('categoryGrace.add', lang)}</label>
        <input name="grace_minutes" type="number" min={0} required placeholder={t('graceTime.minutesLabel', lang)} className={`${input} w-28`} />
      </div>
      <div>
        <label className={label}>{t('graceTime.prayerTiffinLabel', lang)}</label>
        <input name="prayer_tiffin_minutes" type="number" min={0} placeholder={t('graceTime.minutesLabel', lang)} className={`${input} w-28`} />
        <p className="mt-1 text-xs text-muted">{t('graceTime.prayerTiffinHint', lang)}</p>
      </div>
      <button type="submit" disabled={pending} className={btn}>{t('common.add', lang)}</button>
      {error && <p className="w-full text-xs text-alert-deep">{error}</p>}
    </form>
  )
}

export function AddAdHocExemptionForm({ lang }: { lang: Lang }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [categories, setCategories] = useState<Set<string>>(new Set())

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        for (const c of categories) data.append('category', c)
        startTransition(async () => {
          setError(null)
          const result = await addAdHocGraceExemption(data)
          if (result.error) setError(result.error)
          else {
            form.reset()
            setCategories(new Set())
            router.refresh()
          }
        })
      }}
    >
      <div className="flex flex-wrap gap-3">
        <div>
          <label className={labelClass} htmlFor="exemption_date">{t('graceTime.exemptionDate', lang)}</label>
          <input id="exemption_date" name="exemption_date" type="date" required className={dateInputClass({ size: 'md' })} />
        </div>
        <div>
          <label className={labelClass} htmlFor="duration_minutes">{t('graceTime.exemptionDuration', lang)}</label>
          <input id="duration_minutes" name="duration_minutes" type="number" min={0} required className={`${inputClass} w-32`} />
        </div>
        <div className="min-w-64 flex-1">
          <label className={labelClass} htmlFor="details">{t('graceTime.exemptionDetails', lang)}</label>
          <input id="details" name="details" className={inputClass} />
        </div>
      </div>
      <div>
        <p className={labelClass}>{t('graceTime.exemptionCategories', lang)}</p>
        <div className="flex flex-wrap gap-3">
          {EMPLOYEE_CATEGORIES.map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={categories.has(c)}
                onChange={(e) => {
                  const next = new Set(categories)
                  if (e.target.checked) next.add(c)
                  else next.delete(c)
                  setCategories(next)
                }}
              />
              {t(EMPLOYEE_CATEGORY_LABEL_KEY[c], lang)}
            </label>
          ))}
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-10 w-fit cursor-pointer rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {t('common.add', lang)}
      </button>
      {error && <p className="text-sm text-alert-deep">{error}</p>}
    </form>
  )
}
