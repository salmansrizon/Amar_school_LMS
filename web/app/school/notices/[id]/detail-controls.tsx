'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { deletePublication } from '../actions'

export function DeletePublicationButton({ id, lang }: { id: string; lang: Lang }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div>
      {error && <p className="mb-2 text-sm text-alert-deep">{error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t('notices.confirmDelete', lang))) return
          startTransition(async () => {
            const res = await deletePublication(id)
            if (res.error) setError(res.error)
            else router.push('/school/notices')
          })
        }}
        className="cursor-pointer rounded-full bg-alert-soft px-4 py-1.5 text-xs font-semibold text-alert-deep disabled:opacity-50"
      >
        {pending ? t('notices.deleting', lang) : t('common.delete', lang)}
      </button>
    </div>
  )
}
