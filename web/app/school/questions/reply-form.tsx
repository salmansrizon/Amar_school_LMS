'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { RichTextField } from '@/components/rich-text-field'
import { addReply, answerQuestion } from '@/lib/student/messages-source'
import { QUESTION_BODY_MAX } from '@/lib/student/messages'

const ERRORS: Record<string, MessageKey> = {
  notYours: 'questions.notYours',
  replyUnavailable: 'questions.replyUnavailable',
  bodyTooLong: 'questions.replyTooLong',
}

/** `further`: add a reply to a question that already has one (#703 item 5.6,
 *  migration 0254) instead of writing the first reply. */
export function ReplyForm({ lang, messageId, further = false }: { lang: Lang; messageId: string; further?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldKey, setFieldKey] = useState(0)

  return (
    <form
      className="mt-2 grid gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(async () => {
          setError(null)
          const result = await (further ? addReply : answerQuestion)(messageId, data)
          // 'notYours' is the one refusal with a sentence of its own; anything
          // else is a database message and is shown as-is rather than swallowed.
          if (result.error) setError(ERRORS[result.error] ? t(ERRORS[result.error], lang) : result.error)
          else {
            setFieldKey((k) => k + 1)
            router.refresh()
          }
        })
      }}
    >
      <RichTextField
        key={fieldKey}
        name="reply_body"
        label={t(further ? 'questions.addReply' : 'questions.replyLabel', lang)}
        lang={lang}
        rows={4}
        formal
        maxLength={further ? QUESTION_BODY_MAX : undefined}
      />
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
