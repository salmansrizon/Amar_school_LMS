'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { t, type Lang } from '@/lib/i18n'
import { restoreEmployee } from '../actions'

export function RestoreButton({ lang, employeeId }: { lang: Lang; employeeId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const res = await restoreEmployee(employeeId)
            if (res.error) return setError(res.error)
            // #688: restoring does not turn a disabled Staff login back on.
            if (res.notice) toast.warning(res.notice)
            router.refresh()
          })
        }
        className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50"
      >
        {t('employees.restore', lang)}
      </button>
      {error && <span className="ml-2 text-xs text-alert-deep">{error}</span>}
    </span>
  )
}
