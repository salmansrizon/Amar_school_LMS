'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { answerQuestion } from '@/lib/student/messages-source'

export function ReplyForm({ lang, messageId }: { lang: Lang; messageId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(async () => {
          setError(null)
          const result = await answerQuestion(messageId, data)
          // 'notYours' is the one refusal with a sentence of its own; anything
          // else is a database message and is shown as-is rather than swallowed.
          if (result.error)
            setError(result.error === 'notYours' ? t('questions.notYours', lang) : result.error)
          else router.refresh()
        })
      }}
    >
      <input
        name="reply_body"
        required
        placeholder={t('questions.reply', lang)}
        className="h-9 min-w-0 flex-1 rounded-sm border border-line-strong bg-paper px-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-9 cursor-pointer rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {t('questions.reply', lang)}
      </button>
      {error && <span className="text-xs text-alert-deep">{error}</span>}
    </form>
  )
}
