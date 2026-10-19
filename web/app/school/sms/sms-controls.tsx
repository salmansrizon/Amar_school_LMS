'use client'

import { useState, useTransition } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { addOffDay, deleteOffDay, addRule, deleteRule, addLeave, deleteLeave } from './actions'
import { dateInputClass } from '@/components/ui/field'
import { ComboboxField } from '@/components/ui/combobox-field'
import { DateField } from '@/components/ui/date-field'

export function AddOffDayForm({ lang }: { lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="mb-3 flex flex-wrap gap-2"
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
      <DateField lang={lang} name="day" aria-label={t('sms.offDayDate', lang)} required className={dateInputClass()} />
      <input
        type="text"
        name="label"
        aria-label={t('sms.offDayLabel', lang)}
        placeholder={t('sms.offDayLabel', lang)}
        className="h-9 rounded-lg border border-line-strong bg-paper px-3 text-sm outline-none transition focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-300"
      />
      <button
        type="submit"
        disabled={pending}
        className="max-sm:min-h-11 rounded bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {t('sms.addOffDay', lang)}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  )
}

export function DeleteOffDayButton({ day, lang }: { day: string; lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const data = new FormData()
  data.set('day', day)

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteOffDay(data)
            setError(result.error ?? null)
          })
        }
        className="text-red-600 hover:underline disabled:opacity-50"
      >
        {t('common.delete', lang)}
      </button>
    </span>
  )
}

export function AddRuleForm({ lang, ruleType }: { lang: Lang; ruleType: 'exact' | 'range' }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const result = await addRule(data)
          if (result.error) setError(result.error)
          else form.reset()
        })
      }}
    >
      <input type="hidden" name="rule-type" value={ruleType} />
      {ruleType === 'exact' ? (
        <>
          <div>
            <label className="block text-xs text-gray-500">{t('sms.exactRule', lang)}</label>
            <input
              type="number"
              name="exact_days"
              aria-label={t('sms.exactRule', lang)}
              min={1}
              required
              className="w-20 h-9 rounded-lg border border-line-strong bg-paper px-3 text-sm outline-none transition focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-300"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="max-sm:min-h-11 rounded bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t('sms.addExact', lang)}
          </button>
        </>
      ) : (
        <>
          <div>
            <label className="block text-xs text-gray-500">{t('sms.rangeRule', lang)}</label>
            <input
              type="number"
              name="range_from"
              aria-label={`${t('sms.rangeRule', lang)} — ${t('sms.leaveFrom', lang)}`}
              min={1}
              required
              className="w-16 h-9 rounded-lg border border-line-strong bg-paper px-3 text-sm outline-none transition focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-300"
            />
          </div>
          <span className="pb-1.5 text-sm">–</span>
          <div>
            <input
              type="number"
              name="range_to"
              aria-label={`${t('sms.rangeRule', lang)} — ${t('sms.leaveTo', lang)}`}
              min={1}
              required
              className="w-16 h-9 rounded-lg border border-line-strong bg-paper px-3 text-sm outline-none transition focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-300"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="max-sm:min-h-11 rounded bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t('sms.addRange', lang)}
          </button>
        </>
      )}
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  )
}

export function DeleteRuleButton({ id, lang }: { id: string; lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const data = new FormData()
  data.set('id', id)

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteRule(data)
            setError(result.error ?? null)
          })
        }
        className="text-red-600 hover:underline disabled:opacity-50"
      >
        {t('common.delete', lang)}
      </button>
    </span>
  )
}

export function AddLeaveForm({ lang, students }: { lang: Lang; students: { id: string; full_name: string }[] }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="mb-3 flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const result = await addLeave(data)
          if (result.error) setError(result.error)
          else form.reset()
        })
      }}
    >
      <div>
        <label htmlFor="sms_from_day" className="block text-xs text-gray-500">{t('sms.leaveFrom', lang)}</label>
        <DateField lang={lang} id="sms_from_day" name="from_day" required className={dateInputClass()} />
      </div>
      <div>
        <label htmlFor="sms_to_day" className="block text-xs text-gray-500">{t('sms.leaveTo', lang)}</label>
        <DateField lang={lang} id="sms_to_day" name="to_day" required className={dateInputClass()} />
      </div>
      <div>
        <label htmlFor="leave_student" className="block text-xs text-gray-500">{t('sms.leaveStudent', lang)}</label>
        <ComboboxField
          id="leave_student"
          name="student_id"
          required
          defaultValue=""
          options={[
            { value: '', label: '—' },
            ...students.map((s) => ({ value: s.id, label: s.full_name })),
          ]}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="max-sm:min-h-11 self-end rounded bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {t('sms.addLeave', lang)}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  )
}

export function DeleteLeaveButton({ id, lang }: { id: string; lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const data = new FormData()
  data.set('id', id)

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteLeave(data)
            setError(result.error ?? null)
          })
        }
        className="text-red-600 hover:underline disabled:opacity-50"
      >
        {t('common.delete', lang)}
      </button>
    </span>
  )
}