'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { setResultsPublished } from './actions'

// Publishing results (#440). Reversible on purpose — unlike Closing, which is
// one-way — because a school that spots a marking error after publishing must
// be able to pull results back.
export function PublishResults({
  lang,
  examId,
  publishedAt,
}: {
  lang: Lang
  examId: string
  publishedAt: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const published = publishedAt !== null

  return (
    <div className="mb-4 rounded-lg border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          {published ? (
            <span className="font-semibold text-mint-deep">
              ✓ {t('exams.resultsPublished', lang)}
            </span>
          ) : (
            <span className="text-muted">{t('exams.publishHint', lang)}</span>
          )}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const result = await setResultsPublished(examId, !published)
              if (result.error) setError(result.error)
              else router.refresh()
            })
          }
          className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50 ${
            published
              ? 'border border-line-strong hover:bg-paper-muted'
              : 'bg-brand-500 text-white hover:bg-brand-600'
          }`}
        >
          {t(published ? 'exams.unpublishResults' : 'exams.publishResults', lang)}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-alert-deep">{error}</p>}
    </div>
  )
}
