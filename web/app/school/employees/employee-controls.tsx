'use client'

import { useState, useTransition } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { EMPLOYEE_CATEGORIES, EMPLOYEE_CATEGORY_LABEL_KEY } from '@/lib/employees'
import { ComboboxField } from '@/components/ui/combobox-field'
import {
  addOfficeTime,
  setCategoryGrace,
  setDefaultGrace,
  setEmployeeLogin,
  setOfficeTimeAssignment,
  setShiftAssignment,
} from './actions'

const input =
  'h-9 w-full rounded-sm border border-line-strong bg-paper px-2 text-sm outline-none focus:border-brand-500'
const label = 'mb-1 block text-xs font-semibold text-muted'
const btn =
  'h-9 cursor-pointer rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50'

function useAction(action: (data: FormData) => Promise<{ error?: string }>, onSuccess?: () => void) {
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
      else {
        form.reset()
        onSuccess?.()
      }
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

export function AddOfficeTimeForm({ lang }: { lang: Lang }) {
  const { error, pending, submit } = useAction(addOfficeTime)
  return (
    <form onSubmit={submit}>
      <label className={label}>{t('officeTimes.add', lang)}</label>
      <div className="flex gap-2">
        <input name="name" required placeholder={t('officeTimes.name', lang)} className={input} />
        <input name="grace_minutes" type="number" min={0} placeholder={t('officeTimes.grace', lang)} className={`${input} w-24`} />
        <button type="submit" disabled={pending} className={btn}>{t('common.add', lang)}</button>
      </div>
      {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
    </form>
  )
}

// Category is a `<select>` over the fixed EMPLOYEE_CATEGORIES list (issue
// #666), not free text: a typo here used to silently create a grace row that
// matched no Employee, since setCategoryGrace didn't validate it either.
export function CategoryGraceForm({ lang }: { lang: Lang }) {
  // ComboboxField keeps its picked item as internal state; form.reset() alone
  // clears the hidden input but not that display state, so a key remount is
  // what actually clears the picker after a successful add.
  const [categoryKey, setCategoryKey] = useState(0)
  const { error, pending, submit } = useAction(setCategoryGrace, () => setCategoryKey((k) => k + 1))
  return (
    <form onSubmit={submit}>
      <label className={label}>{t('categoryGrace.add', lang)}</label>
      <div className="flex gap-2">
        <ComboboxField
          key={categoryKey}
          name="category"
          required
          defaultValue=""
          aria-label={t('employees.category', lang)}
          options={[
            { value: '', label: t('employees.category', lang), disabled: true },
            ...EMPLOYEE_CATEGORIES.map((c) => ({ value: c, label: t(EMPLOYEE_CATEGORY_LABEL_KEY[c], lang) })),
          ]}
        />
        <input name="grace_minutes" type="number" min={0} required placeholder={t('officeTimes.grace', lang)} className={`${input} w-24`} />
        <button type="submit" disabled={pending} className={btn}>{t('common.add', lang)}</button>
      </div>
      {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
    </form>
  )
}

export function OfficeTimeToggle({
  employeeId,
  officeTimeId,
  label: officeTimeName,
  assigned,
}: {
  employeeId: string
  officeTimeId: string
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
          const { error } = await setOfficeTimeAssignment(employeeId, officeTimeId, next)
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
      {officeTimeName}
    </button>
  )
}

/** An Employee's permanent academic Shift assignment (issue #580, Wave
 *  5/#590) — structurally identical to OfficeTimeToggle (one independently-
 *  wired pill per option, optimistic-immediate save, no batch submit), kept
 *  as its own component rather than a shared generic one because #580's
 *  binding requirement is that this reads unambiguously as *permanent*
 *  assignment, distinct from Global Shift Selection's view-preference
 *  toggle elsewhere in the chrome — a shared component would invite the two
 *  to drift toward looking like the same kind of control. */
export function ShiftToggle({
  employeeId,
  shift,
  label: shiftLabel,
  assigned,
}: {
  employeeId: string
  shift: string
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
          const { error } = await setShiftAssignment(employeeId, shift, next)
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
      {shiftLabel}
    </button>
  )
}

/** Links an Employee to one of the School's Staff User logins (#443). Owner-only
 *  in practice: `profiles` RLS only lets a School Owner list their school's
 *  logins, so a Staff User sees an empty picker and the page hides it. */
export function LoginLinkPicker({
  lang,
  employeeId,
  current,
  logins,
}: {
  lang: Lang
  employeeId: string
  current: string | null
  logins: { id: string; full_name: string | null }[]
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div>
      <label className={label} htmlFor="employee_login">
        {t('employees.loginLink', lang)}
      </label>
      <ComboboxField
        id="employee_login"
        defaultValue={current ?? ''}
        disabled={pending}
        onValueChange={(v) => {
          const value = v || null
          startTransition(async () => {
            setError(null)
            const result = await setEmployeeLogin(employeeId, value)
            if (result.error) setError(result.error)
          })
        }}
        options={[
          { value: '', label: t('employees.loginLinkNone', lang) },
          ...logins.map((login) => ({ value: login.id, label: login.full_name ?? login.id })),
        ]}
      />
      <p className="mt-1 text-xs text-muted">{t('employees.loginLinkHint', lang)}</p>
      {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
    </div>
  )
}
