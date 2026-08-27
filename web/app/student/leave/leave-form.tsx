'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { requestLeave, withdrawLeave } from '@/lib/student/leave-source'

// Every failure the action can return, in the reader's language. The action
// returns codes precisely so this table exists in one place; anything it does
// not recognise (a raw Postgres message) is shown as-is rather than swallowed.
const LEAVE_ERROR: Record<string, MessageKey> = {
  readOnly: 'student.readOnly',
  required: 'student.correctionValueBad',
  order: 'student.leaveOrder',
  past: 'student.leavePast',
  overlap: 'student.leaveOverlap',
  notPending: 'student.leaveDecided',
}

const message = (code: string, lang: Lang) =>
  LEAVE_ERROR[code] ? t(LEAVE_ERROR[code], lang) : code

export function LeaveRequestForm({
  lang,
  disabled,
  today,
}: {
  lang: Lang
  disabled?: boolean
  /** Asia/Dhaka today, from the server — the browser's clock is not the school's. */
  today: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          setSent(false)
          const result = await requestLeave(data)
          if (result.error) setError(message(result.error, lang))
          else {
            setSent(true)
            form.reset()
            router.refresh()
          }
        })
      }}
    >
      <label className="text-xs font-semibold text-muted">
        <span className="mb-1 block">{t('student.leaveFrom', lang)}</span>
        <input
          name="from_day"
          type="date"
          required
          min={today}
          className="h-9 w-full rounded-sm border border-line-strong bg-paper px-2 text-sm"
        />
      </label>
      <label className="text-xs font-semibold text-muted">
        <span className="mb-1 block">{t('student.leaveTo', lang)}</span>
        <input
          name="to_day"
          type="date"
          required
          min={today}
          className="h-9 w-full rounded-sm border border-line-strong bg-paper px-2 text-sm"
        />
      </label>
      <label className="text-xs font-semibold text-muted sm:col-span-2">
        <span className="mb-1 block">{t('student.leaveReason', lang)}</span>
        {/* A reason is a sentence to a teacher, not a field — one line was not
            enough room to write one. */}
        <textarea
          name="reason"
          rows={2}
          className="w-full rounded-sm border border-line-strong bg-paper px-2 py-1.5 text-sm"
        />
      </label>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
      {sent && <p className="text-sm text-mint-deep sm:col-span-4">{t('student.leaveSubmitted', lang)}</p>}
      <button
        type="submit"
        disabled={pending || disabled}
        className="cursor-pointer rounded-full bg-brand-500 px-5 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 sm:col-span-4"
      >
        {t('student.requestLeave', lang)}
      </button>
    </form>
  )
}

/** Withdraw, offered only while the request is still pending — RLS (0157) is
 *  what enforces that, so a stale button fails closed with a message. */
export function WithdrawLeaveButton({
  lang,
  leaveId,
  disabled,
}: {
  lang: Lang
  leaveId: string
  disabled?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-alert-deep">{error}</span>}
      <button
        type="button"
        disabled={pending || disabled}
        onClick={() =>
          startTransition(async () => {
            const result = await withdrawLeave(leaveId)
            if (result.error) setError(message(result.error, lang))
            else router.refresh()
          })
        }
        className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-muted transition hover:bg-alert-soft hover:text-alert-deep disabled:opacity-50"
      >
        {t('student.leaveWithdraw', lang)}
      </button>
    </span>
  )
}
