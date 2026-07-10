'use client'

import { useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { addBehaviourEntry, updateBehaviourEntry, sendBehaviourSms } from '../actions'

export function AddEntryForm({ studentId, lang }: { studentId: string; lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const result = await addBehaviourEntry(data)
          if (result.error) setError(result.error)
          else form.reset()
        })
      }}
    >
      <input type="hidden" name="student_id" value={studentId} />
      <div className="sm:col-span-3">
        <label className={labelClass} htmlFor="note">{t('behaviour.note', lang)}</label>
        <textarea id="note" name="note" required rows={2} className={`${inputClass} h-auto py-2`} />
      </div>
      <div>
        <label className={labelClass} htmlFor="rating">{t('behaviour.rating', lang)}</label>
        <input id="rating" name="rating" type="number" min={0} max={10} defaultValue={5} required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="remind_date">{t('behaviour.remind', lang)}</label>
        <input id="remind_date" name="remind_date" type="date" className={inputClass} />
      </div>
      <div className="flex items-end">
        <button type="submit" disabled={pending} className={primaryBtnClass}>
          {t('common.add', lang)}
        </button>
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-3">{error}</p>}
    </form>
  )
}

export function EditableEntry({
  entry,
  studentId,
  locked,
  lang,
}: {
  entry: { id: string; note: string; rating: number; remind_date: string | null; created_at: string }
  studentId: string
  locked: boolean
  lang: Lang
}) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [smsSent, setSmsSent] = useState(false)
  const [pending, startTransition] = useTransition()
  const [smsPending, startSmsTransition] = useTransition()

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm">{entry.note}</p>
          <p className="mt-1 text-xs text-muted">
            {t('behaviour.rating', lang)}: <strong>{entry.rating}</strong>
            {entry.remind_date && <> · {t('behaviour.remind', lang)}: {entry.remind_date}</>}
            {' · '}
            {new Date(entry.created_at).toLocaleDateString()}
          </p>
          {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {smsSent ? (
            <span className="rounded-full bg-mint-soft px-2 py-0.5 text-xs font-semibold text-mint-deep">
              {t('behaviour.smsSent', lang)}
            </span>
          ) : (
            <button
              type="button"
              disabled={smsPending}
              onClick={() =>
                startSmsTransition(async () => {
                  setError(null)
                  const result = await sendBehaviourSms(entry.id)
                  if (result.error) setError(result.error)
                  else setSmsSent(true)
                })
              }
              className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50"
            >
              {smsPending ? t('behaviour.sendingSms', lang) : t('behaviour.sendSms', lang)}
            </button>
          )}
          {locked ? (
            <span className="rounded-full bg-paper-muted px-2 py-0.5 text-xs font-semibold text-muted">
              🔒 {t('behaviour.locked', lang)}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
            >
              {t('behaviour.edit', lang)}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(async () => {
          setError(null)
          const result = await updateBehaviourEntry(data)
          if (result.error) setError(result.error)
          else setEditing(false)
        })
      }}
    >
      <input type="hidden" name="id" value={entry.id} />
      <input type="hidden" name="student_id" value={studentId} />
      <textarea name="note" defaultValue={entry.note} required rows={2} className={`${inputClass} h-auto py-2`} />
      <div className="flex items-center gap-2">
        <input name="rating" type="number" min={0} max={10} defaultValue={entry.rating} required className={`${inputClass} w-24`} />
        <input name="remind_date" type="date" defaultValue={entry.remind_date ?? ''} className={`${inputClass} w-40`} />
        <button type="submit" disabled={pending} className="h-9 cursor-pointer rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
          {t('behaviour.save', lang)}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted">✕</button>
      </div>
      {error && <p className="text-sm text-alert-deep">{error}</p>}
    </form>
  )
}
