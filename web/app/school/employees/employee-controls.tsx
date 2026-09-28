'use client'

import { useState, useTransition } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { setEmployeeLogin, setShiftAssignment } from './actions'

const input =
  'h-9 w-full rounded-sm border border-line-strong bg-paper px-2 text-sm outline-none focus:border-brand-500'
const label = 'mb-1 block text-xs font-semibold text-muted'

/** An Employee's permanent academic Shift assignment (issue #580, Wave
 *  5/#590) — one independently-wired pill per option, optimistic-immediate
 *  save, no batch submit. #580's binding requirement is that this reads
 *  unambiguously as *permanent* assignment, distinct from Global Shift
 *  Selection's view-preference toggle elsewhere in the chrome. */
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
      <select
        id="employee_login"
        defaultValue={current ?? ''}
        disabled={pending}
        className={input}
        onChange={(e) => {
          const value = e.target.value || null
          startTransition(async () => {
            setError(null)
            const result = await setEmployeeLogin(employeeId, value)
            if (result.error) setError(result.error)
          })
        }}
      >
        <option value="">{t('employees.loginLinkNone', lang)}</option>
        {logins.map((login) => (
          <option key={login.id} value={login.id}>
            {login.full_name ?? login.id}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-muted">{t('employees.loginLinkHint', lang)}</p>
      {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
    </div>
  )
}
