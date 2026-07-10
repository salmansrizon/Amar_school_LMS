'use client'

import { useState, useTransition } from 'react'
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

function statusBadgeClass(status: Message['status']): string {
  if (status === 'unread') return 'bg-sun-soft text-sun-deep'
  if (status === 'answered') return 'bg-mint-soft text-mint-deep'
  return 'bg-paper-muted text-muted'
}

function statusLabelKey(status: Message['status']): 'feedback.statusUnread' | 'feedback.statusRead' | 'feedback.statusAnswered' {
  if (status === 'unread') return 'feedback.statusUnread'
  if (status === 'answered') return 'feedback.statusAnswered'
  return 'feedback.statusRead'
}

export function FeedbackRow({ message, lang }: { message: Message; lang: Lang }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleOpen() {
    const willOpen = !open
    setOpen(willOpen)
    if (willOpen && message.status === 'unread') {
      startTransition(() => {
        markFeedbackRead(message.id)
      })
    }
  }

  return (
    <>
      <tr className="border-b border-line">
        <td className="px-3 py-2 text-sm">
          {message.sender_name}
          {message.sender_role && <span className="text-muted"> ({message.sender_role})</span>}
        </td>
        <td className="px-3 py-2 text-sm text-muted">{message.subject}</td>
        <td className="px-3 py-2 text-sm">{new Date(message.created_at).toLocaleDateString()}</td>
        <td className="px-3 py-2 text-sm">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(message.status)}`}>
            {t(statusLabelKey(message.status), lang)}
          </span>
        </td>
        <td className="px-3 py-2 text-sm">
          <button
            type="button"
            onClick={handleOpen}
            className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
          >
            {open
              ? t('feedback.close', lang)
              : message.status === 'answered'
                ? t('feedback.view', lang)
                : t('feedback.reply', lang)}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line bg-paper-muted">
          <td colSpan={5} className="px-3 py-3">
            <p className="mb-3 text-sm">{message.body}</p>
            {message.reply_body && (
              <div className="mb-3 rounded-md border border-line bg-paper p-3">
                <p className="mb-1 text-xs font-semibold text-muted">
                  {t('feedback.replied', lang)}
                  {message.replied_at && ` — ${new Date(message.replied_at).toLocaleDateString()}`}
                </p>
                <p className="text-sm">{message.reply_body}</p>
              </div>
            )}
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-start"
              onSubmit={(e) => {
                e.preventDefault()
                const form = e.currentTarget
                const data = new FormData(form)
                startTransition(async () => {
                  setError(null)
                  const result = await replyToFeedback(data)
                  if (result.error) setError(result.error)
                  else form.reset()
                })
              }}
            >
              <input type="hidden" name="id" value={message.id} />
              <textarea
                name="reply_body"
                placeholder={t('feedback.replyPlaceholder', lang)}
                required
                rows={2}
                className={`${inputClass} h-auto flex-1 py-2`}
              />
              <button type="submit" disabled={pending} className={primaryBtnClass}>
                {pending ? t('feedback.sending', lang) : t('feedback.send', lang)}
              </button>
            </form>
            {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
          </td>
        </tr>
      )}
    </>
  )
}
