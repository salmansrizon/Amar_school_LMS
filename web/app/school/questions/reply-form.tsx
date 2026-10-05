'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { RichTextField } from '@/components/rich-text-field'
import { answerQuestion } from '@/lib/student/messages-source'

export function ReplyForm({ lang, messageId }: { lang: Lang; messageId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="mt-2 grid gap-2"
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
      <RichTextField name="reply_body" label={t('questions.replyLabel', lang)} lang={lang} rows={4} formal />
      <button
        type="submit"
        disabled={pending}
        className="h-11 cursor-pointer justify-self-start rounded-full bg-brand-500 px-5 text-xs sm:h-9 font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {t('questions.reply', lang)}
      </button>
      {error && <span className="text-xs text-alert-deep">{error}</span>}
    </form>
  )
}
