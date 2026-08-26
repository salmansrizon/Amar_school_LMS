'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { requestLeave } from '@/lib/student/leave-source'

export function LeaveRequestForm({ lang, disabled }: { lang: Lang; disabled?: boolean }) {
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
          if (result.error) setError(result.error)
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
          className="h-9 w-full rounded-sm border border-line-strong bg-paper px-2 text-sm"
        />
      </label>
      <label className="text-xs font-semibold text-muted">
        <span className="mb-1 block">{t('student.leaveTo', lang)}</span>
        <input
          name="to_day"
          type="date"
          required
          className="h-9 w-full rounded-sm border border-line-strong bg-paper px-2 text-sm"
        />
      </label>
      <label className="text-xs font-semibold text-muted sm:col-span-2">
        <span className="mb-1 block">{t('student.leaveReason', lang)}</span>
        <input
          name="reason"
          className="h-9 w-full rounded-sm border border-line-strong bg-paper px-2 text-sm"
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
