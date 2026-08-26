'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { reviewSubmission } from './actions'

// The teacher's review of one submission (#448). Marks and a comment are both
// optional — an unreviewed submission is a normal state, not a broken one.
export function ReviewForm({
  lang,
  submissionId,
  marks,
  comment,
}: {
  lang: Lang
  submissionId: string
  marks: number | null
  comment: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(async () => {
          setError(null)
          setSaved(false)
          const result = await reviewSubmission(submissionId, data)
          if (result.error) setError(result.error)
          else {
            setSaved(true)
            router.refresh()
          }
        })
      }}
    >
      <input
        name="marks"
        type="number"
        step="0.5"
        min="0"
        defaultValue={marks ?? ''}
        placeholder={t('review.marks', lang)}
        className="h-8 w-24 rounded-sm border border-line-strong bg-paper px-2 text-xs"
      />
      <input
        name="teacher_comment"
        defaultValue={comment ?? ''}
        placeholder={t('review.comment', lang)}
        className="h-8 min-w-0 flex-1 rounded-sm border border-line-strong bg-paper px-2 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-8 cursor-pointer rounded-full bg-brand-500 px-3 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {t('review.save', lang)}
      </button>
      {saved && <span className="text-xs text-mint-deep">✓</span>}
      {error && <span className="text-xs text-alert-deep">{error}</span>}
    </form>
  )
}
