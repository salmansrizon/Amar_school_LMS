'use client'

import { useState, useTransition } from 'react'
import { inputClass, labelClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { assignCard, removeCard, setAutomaticAttendance } from './actions'

export function AssignCardForm({
  students,
  employees,
  lang,
}: {
  students: { id: string; full_name: string }[]
  employees: { id: string; full_name: string }[]
  lang: Lang
}) {
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
          const result = await assignCard(data)
          if (result.error) setError(result.error)
          else form.reset()
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor="card_number">{t('attendance.cardNumber', lang)}</label>
        <input id="card_number" name="card_number" required className={`${inputClass} font-mono`} />
      </div>
      <div>
        <label className={labelClass} htmlFor="holder">{t('attendance.holder', lang)}</label>
        <select id="holder" name="holder" required className={inputClass}>
          <optgroup label={t('students.title', lang)}>
            {students.map((s) => (
              <option key={s.id} value={`student:${s.id}`}>{s.full_name}</option>
            ))}
          </optgroup>
          <optgroup label={t('employees.title', lang)}>
            {employees.map((e) => (
              <option key={e.id} value={`employee:${e.id}`}>{e.full_name}</option>
            ))}
          </optgroup>
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-10 cursor-pointer rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {t('attendance.assign', lang)}
      </button>
      {error && <p className="w-full text-sm text-alert-deep">{error}</p>}
    </form>
  )
}

// Per-school manual-attendance override switch (issue #30, PRD §5.3): the
// legacy "de-activate automatic attendance" toggle. Optimistic like
// OfficeTimeToggle (app/school/employees/employee-controls.tsx), reverts on error.
export function AutomaticAttendanceToggle({ enabled, lang }: { enabled: boolean; lang: Lang }) {
  const [on, setOn] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        aria-pressed={on}
        onClick={() =>
          startTransition(async () => {
            const next = !on
            setOn(next)
            setError(null)
            const result = await setAutomaticAttendance(next)
            if (result.error) {
              setOn(!next)
              setError(result.error)
            }
          })
        }
        className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
          on ? 'bg-mint-soft text-mint-deep' : 'bg-paper-muted text-muted'
        } ${pending ? 'opacity-60' : ''}`}
      >
        {t(on ? 'attendance.automaticEnabled' : 'attendance.automaticDisabled', lang)}
      </button>
      {error && <span className="text-xs text-alert-deep">{error}</span>}
    </div>
  )
}

export function RemoveCardButton({ id, label }: { id: string; label: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-alert-deep">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await removeCard(id)
            setError(result.error ?? null)
          })
        }
        className="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      >
        {label}
      </button>
    </span>
  )
}
