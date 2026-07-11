'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { requestLeave, approveLeave, rejectLeave } from '../manual-actions'

export function RequestLeaveForm({
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
          const result = await requestLeave(data)
          if (result.error) setError(result.error)
          else form.reset()
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor="holder">
          {t('attendance.leavePerson', lang)}
        </label>
        <select id="holder" name="holder" required className={inputClass}>
          <optgroup label={t('students.title', lang)}>
            {students.map((s) => (
              <option key={s.id} value={`student:${s.id}`}>
                {s.full_name}
              </option>
            ))}
          </optgroup>
          <optgroup label={t('employees.title', lang)}>
            {employees.map((e) => (
              <option key={e.id} value={`employee:${e.id}`}>
                {e.full_name}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="from_day">
          {t('attendance.leaveFromCol', lang)}
        </label>
        <input id="from_day" name="from_day" type="date" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="to_day">
          {t('attendance.leaveToCol', lang)}
        </label>
        <input id="to_day" name="to_day" type="date" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="reason">
          {t('attendance.leaveReasonCol', lang)}
        </label>
        <input id="reason" name="reason" className={inputClass} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-10 cursor-pointer rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {t('attendance.leaveSubmit', lang)}
      </button>
      {error && <p className="w-full text-sm text-alert-deep">{error}</p>}
    </form>
  )
}

export function LeaveActions({ kind, id, lang }: { kind: string; id: string; lang: Lang }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const act = (fn: typeof approveLeave) =>
    startTransition(async () => {
      setError(null)
      const result = await fn(kind, id)
      if (result.error) setError(result.error)
      else router.refresh()
    })

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => act(approveLeave)}
        className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50"
      >
        {t('attendance.leaveApprove', lang)}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => act(rejectLeave)}
        className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      >
        {t('attendance.leaveReject', lang)}
      </button>
      {error && <span className="text-xs text-alert-deep">{error}</span>}
    </span>
  )
}
