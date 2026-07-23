'use client'

import { useState, useTransition } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { addOffDay, deleteOffDay, addRule, deleteRule, addLeave, deleteLeave } from './actions'
import { dateInputClass, selectClass } from '@/components/ui/field'

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
      <input type="date" name="day" required className={dateInputClass()} />
      <input
        type="text"
        name="label"
        placeholder={t('sms.offDayLabel', lang)}
        className="h-9 rounded-lg border border-line-strong bg-paper px-3 text-sm outline-none transition focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-300"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
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
              min={1}
              required
              className="w-20 h-9 rounded-lg border border-line-strong bg-paper px-3 text-sm outline-none transition focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-300"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
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
              min={1}
              required
              className="w-16 h-9 rounded-lg border border-line-strong bg-paper px-3 text-sm outline-none transition focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-300"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
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
        <label className="block text-xs text-gray-500">{t('sms.leaveFrom', lang)}</label>
        <input type="date" name="from_day" required className={dateInputClass()} />
      </div>
      <div>
        <label className="block text-xs text-gray-500">{t('sms.leaveTo', lang)}</label>
        <input type="date" name="to_day" required className={dateInputClass()} />
      </div>
      <div>
        <label className="block text-xs text-gray-500">{t('sms.leaveStudent', lang)}</label>
        <select name="student_id" required className={selectClass()}>
          <option value="">—</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="self-end rounded bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
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