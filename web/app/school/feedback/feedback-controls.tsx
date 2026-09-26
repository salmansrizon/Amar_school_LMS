'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { logFeedbackMessage, markFeedbackRead, replyToFeedback } from './actions'

export function LogFeedbackForm({ lang }: { lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const result = await logFeedbackMessage(data)
          if (result.error) setError(result.error)
          else form.reset()
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor="sender_name">{t('feedback.senderName', lang)}</label>
        <input id="sender_name" name="sender_name" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="sender_role">{t('feedback.senderRole', lang)}</label>
        <input id="sender_role" name="sender_role" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="sender_contact">{t('feedback.senderContact', lang)}</label>
        <input id="sender_contact" name="sender_contact" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="sender_email">{t('feedback.senderEmail', lang)}</label>
        <input id="sender_email" name="sender_email" type="email" className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="subject">{t('feedback.subject', lang)}</label>
        <input id="subject" name="subject" required className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="body">{t('feedback.message', lang)}</label>
        <textarea id="body" name="body" required rows={3} className={`${inputClass} h-auto py-2`} />
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-2">{error}</p>}
      <button type="submit" disabled={pending} className={`${primaryBtnClass} sm:col-span-2`}>
        {t('feedback.logBtn', lang)}
      </button>
    </form>
  )
}

type Message = {
  id: string
  sender_name: string
  sender_role: string | null
  subject: string
  body: string
  status: 'unread' | 'read' | 'answered'
  reply_body: string | null
  replied_at: string | null
  created_at: string
}

/**
 * The drawer's interactive half (map 013 FC4): marks the message read once
 * it is opened unread — replacing the old expandable row's `handleOpen` — and
 * either shows the standing reply or the reply form. Both actions are the
 * existing actions.ts server actions, called unchanged.
 *
 * The mark-read effect keys off `message.id`: opening record A then record B
 * without unmounting (RecordDrawer keeps one component instance across a
 * `?view=` change) must still fire once per record, and once `status` has
 * flipped away from 'unread' via router.refresh() the same id will not
 * re-trigger it.
 */
export function FeedbackDetail({ message, lang }: { message: Message; lang: Lang }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState(false)
  const [pending, startTransition] = useTransition()
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  useEffect(() => {
    if (message.status !== 'unread') return
    startTransition(() => {
      markFeedbackRead(message.id).then(() => router.refresh())
    })
    // Only the id should re-arm this — re-running on every `status` change
    // would fire again the instant router.refresh() updates the prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id])

  if (message.reply_body) {
    return (
      <div className="rounded-md bg-mint-soft p-3">
        <p className="mb-1 text-xs font-semibold text-mint-deep">
          {t('feedback.replied', lang)}
          {message.replied_at && (
            <> · {t('feedback.repliedOn', lang)}: {new Date(message.replied_at).toLocaleDateString(locale)}</>
          )}
        </p>
        <p className="whitespace-pre-wrap text-sm">{message.reply_body}</p>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          setWarning(false)
          const result = await replyToFeedback(data)
          if (result.error) setError(result.error)
          else {
            if (result.emailFailed) setWarning(true)
            form.reset()
            router.refresh()
          }
        })
      }}
    >
      <input type="hidden" name="id" value={message.id} />
      <textarea
        name="reply_body"
        placeholder={t('feedback.replyPlaceholder', lang)}
        required
        rows={3}
        className={`${inputClass} h-auto py-2`}
      />
      <button type="submit" disabled={pending} className={primaryBtnClass}>
        {pending ? t('feedback.sending', lang) : t('feedback.send', lang)}
      </button>
      {error && <p className="text-xs text-alert-deep">{error}</p>}
      {warning && <p className="text-xs text-sun-deep">{t('feedback.emailFailed', lang)}</p>}
    </form>
  )
}
