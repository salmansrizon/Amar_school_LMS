'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { askQuestion } from '@/lib/student/messages-source'
import { RichTextField } from '@/components/rich-text-field'
import { QUESTION_BODY_MAX } from '@/lib/student/messages'

const ERRORS: Record<string, MessageKey> = { bodyRequired: 'student.bodyRequired', bodyTooLong: 'student.bodyTooLong' }

/** A follow-up is a new question row with the same anchor and title as the
 *  original (see lib/student/question-threads.ts). Allowed while the last
 *  message is still unanswered: the student adds detail, the teacher sees it. */
export function FollowUpForm({
  lang,
  title,
  publicationId,
  subjectId,
  threadId,
}: {
  lang: Lang
  title: string
  publicationId: string | null
  subjectId: string | null
  /** The original question's id (#703 item 5.4); ignored until migration 0253. */
  threadId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [fieldKey, setFieldKey] = useState(0)

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        data.set('subject', title)
        data.set('thread_id', threadId)
        if (publicationId) data.set('publication_id', publicationId)
        else if (subjectId) data.set('subject_id', subjectId)
        startTransition(async () => {
          setError(null)
          setSent(false)
          const result = await askQuestion(data)
          if (result.error) setError(ERRORS[result.error] ? t(ERRORS[result.error], lang) : result.error)
          else {
            setSent(true)
            setFieldKey((k) => k + 1)
            router.refresh()
          }
        })
      }}
    >
      <RichTextField key={fieldKey} name="body" label={t('student.followUp', lang)} lang={lang} rows={4} maxLength={QUESTION_BODY_MAX} />
      {error && <p className="text-sm text-alert-deep">{error}</p>}
      {sent && (
        <p role="status" className="text-sm text-mint-deep">
          {t('student.questionSent', lang)}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer justify-self-start max-sm:justify-self-stretch rounded-full bg-brand-500 px-5 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 max-sm:min-h-11"
      >
        {t('student.send', lang)}
      </button>
    </form>
  )
}
