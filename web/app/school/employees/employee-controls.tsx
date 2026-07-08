'use client'

import { useState, useTransition } from 'react'
import { t, type Lang } from '@/lib/i18n'
import {
  addEmployee,
  addShift,
  setCategoryGrace,
  setDefaultGrace,
  setShiftAssignment,
} from './actions'

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

export function AddShiftForm({ lang }: { lang: Lang }) {
  const { error, pending, submit } = useAction(addShift)
  return (
    <form onSubmit={submit}>
      <label className={label}>{t('shifts.add', lang)}</label>
      <div className="flex gap-2">
        <input name="name" required placeholder={t('shifts.name', lang)} className={input} />
        <input name="grace_minutes" type="number" min={0} placeholder={t('shifts.grace', lang)} className={`${input} w-24`} />
        <button type="submit" disabled={pending} className={btn}>{t('common.add', lang)}</button>
      </div>
      {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
    </form>
  )
}

export function CategoryGraceForm({ lang }: { lang: Lang }) {
  const { error, pending, submit } = useAction(setCategoryGrace)
  return (
    <form onSubmit={submit}>
      <label className={label}>{t('categoryGrace.add', lang)}</label>
      <div className="flex gap-2">
        <input name="category" required placeholder={t('employees.category', lang)} className={input} />
        <input name="grace_minutes" type="number" min={0} required placeholder={t('shifts.grace', lang)} className={`${input} w-24`} />
        <button type="submit" disabled={pending} className={btn}>{t('common.add', lang)}</button>
      </div>
      {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
    </form>
  )
}

export function AddEmployeeForm({ lang }: { lang: Lang }) {
  const { error, pending, submit } = useAction(addEmployee)
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-4">
      <div className="sm:col-span-2">
        <label className={label} htmlFor="emp_name">{t('employees.name', lang)}</label>
        <input id="emp_name" name="full_name" required className={input} />
      </div>
      <div>
        <label className={label} htmlFor="emp_category">{t('employees.category', lang)}</label>
        <input id="emp_category" name="category" className={input} />
      </div>
      <div>
        <label className={label} htmlFor="emp_override">{t('employees.override', lang)}</label>
        <input id="emp_override" name="grace_override" type="number" min={0} className={input} />
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="h-10 cursor-pointer rounded-full bg-brand-500 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 sm:col-span-4"
      >
        {t('employees.add', lang)}
      </button>
    </form>
  )
}

export function ShiftToggle({
  employeeId,
  shiftId,
  label: shiftName,
  assigned,
}: {
  employeeId: string
  shiftId: string
  label: string
  assigned: boolean
}) {
  const [on, setOn] = useState(assigned)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={on}
      onClick={() =>
        startTransition(async () => {
          const next = !on
          setOn(next)
          setFailed(false)
          const { error } = await setShiftAssignment(employeeId, shiftId, next)
          if (error) {
            setOn(!next)
            setFailed(true)
          }
        })
      }
      className={`cursor-pointer rounded-full px-3 py-0.5 text-xs font-semibold transition-colors ${
        on ? 'bg-mint-soft text-mint-deep' : 'bg-paper-muted text-muted'
      } ${pending ? 'opacity-60' : ''} ${failed ? 'ring-1 ring-alert' : ''}`}
    >
      {shiftName}
    </button>
  )
}
