'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { requestLeave, approveLeave, rejectLeave } from '../manual-actions'
import { dateInputClass } from '@/components/ui/field'
import { Modal } from '@/components/modal'

// Replaces the old dropdown-of-every-person-in-the-institute form (map #668)
// — a row action on an already-filtered roster instead, so the person is
// implicit (whichever row's button was clicked) rather than picked from a
// list of everyone. Still submits the same `holder` ("student:<id>" |
// "employee:<id>") shape `requestLeave` already expects — only the trigger
// changed, not the server action.
export function RequestLeaveButton({
  kind,
  personId,
  personLabel,
  lang,
}: {
  kind: 'student' | 'employee'
  personId: string
  personLabel: string
  lang: Lang
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <Modal
      lang={lang}
      triggerLabel={t('attendance.leaveRequestTitle', lang)}
      triggerClassName="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
      title={t('attendance.leaveRequestTitle', lang)}
      onOpenChange={(open) => {
        if (!open) setError(null)
      }}
    >
      {(close) => (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            const data = new FormData(e.currentTarget)
            data.set('holder', `${kind}:${personId}`)
            startTransition(async () => {
              setError(null)
              const result = await requestLeave(data)
              if (result.error) setError(result.error)
              else {
                close()
                router.refresh()
              }
            })
          }}
        >
          <p className="text-sm text-muted">
            {t('attendance.leavePerson', lang)}: <span className="font-semibold text-ink">{personLabel}</span>
          </p>
          <div>
            <label className={labelClass} htmlFor={`from_day-${kind}-${personId}`}>
              {t('attendance.leaveFromCol', lang)}
            </label>
            <input
              id={`from_day-${kind}-${personId}`}
              name="from_day"
              type="date"
              required
              className={dateInputClass({ size: 'md', fullWidth: true })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor={`to_day-${kind}-${personId}`}>
              {t('attendance.leaveToCol', lang)}
            </label>
            <input
              id={`to_day-${kind}-${personId}`}
              name="to_day"
              type="date"
              required
              className={dateInputClass({ size: 'md', fullWidth: true })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor={`reason-${kind}-${personId}`}>
              {t('attendance.leaveReasonCol', lang)}
            </label>
            <input id={`reason-${kind}-${personId}`} name="reason" className={inputClass} />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="h-10 cursor-pointer rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {t('attendance.leaveSubmit', lang)}
          </button>
          {error && <p className="text-sm text-alert-deep">{error}</p>}
        </form>
      )}
    </Modal>
  )
}

export function LeaveActions({ kind, id, lang }: { kind: 'student' | 'employee'; id: string; lang: Lang }) {
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
