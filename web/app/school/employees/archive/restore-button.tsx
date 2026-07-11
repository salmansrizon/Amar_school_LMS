'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
            if (res.error) setError(res.error)
            else router.refresh()
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
