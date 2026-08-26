'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { applyCorrection, rejectCorrectionRequest } from '@/lib/student/corrections-source'

/** Apply or reject one request (#456). Rejecting carries a reason, because "no"
 *  without one is not an answer the Student can act on. */
export function ResolveButtons({ lang, requestId }: { lang: Lang; requestId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      setError(null)
      const result = await fn()
      if (result.error) setError(result.error)
      else router.refresh()
    })

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => applyCorrection(requestId))}
        className="cursor-pointer rounded-full bg-brand-500 px-4 py-1 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {t('corrections.apply', lang)}
      </button>

      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('corrections.reason', lang)}
        className="h-8 w-40 rounded-sm border border-line-strong bg-paper px-2 text-xs"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => rejectCorrectionRequest(requestId, reason))}
        className="cursor-pointer rounded-full border border-alert px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      >
        {t('corrections.reject', lang)}
      </button>

      {error && <span className="text-xs text-alert-deep">{error}</span>}
    </div>
  )
}
