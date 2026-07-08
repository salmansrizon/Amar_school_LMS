'use client'

import { useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { addExam, closeExam, renameExam } from './actions'

export function AddExamForm({ lang }: { lang: Lang }) {
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
          const result = await addExam(data)
          if (result.error) setError(result.error)
          else form.reset()
        })
      }}
    >
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="exam_name">{t('exams.name', lang)}</label>
        <input id="exam_name" name="name" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="exam_year">{t('exams.year', lang)}</label>
        <input id="exam_year" name="exam_year" type="number" min={2000} max={2100} defaultValue={new Date().getFullYear()} required className={inputClass} />
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-3">{error}</p>}
      <button type="submit" disabled={pending} className={`${primaryBtnClass} sm:col-span-3`}>
        {t('exams.add', lang)}
      </button>
    </form>
  )
}

export function ExamRow({
  exam,
  lang,
}: {
  exam: { id: string; name: string; exam_year: number; status: string; closed_at: string | null }
  lang: Lang
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(exam.name)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const closed = exam.status === 'closed'

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {editing && !closed ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              startTransition(async () => {
                setError(null)
                const result = await renameExam(exam.id, name)
                if (result.error) setError(result.error)
                else setEditing(false)
              })
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} h-8 w-48`} />
            <button type="submit" disabled={pending} className="h-8 cursor-pointer rounded-full bg-brand-500 px-3 text-xs font-semibold text-white">
              ✓
            </button>
          </form>
        ) : (
          <span className="text-sm font-medium">
            {exam.name} <span className="text-muted">({exam.exam_year})</span>
          </span>
        )}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            closed ? 'bg-paper-muted text-muted' : 'bg-mint-soft text-mint-deep'
          }`}
        >
          {closed ? `🔒 ${t('exams.closed', lang)}` : t('exams.open', lang)}
        </span>
      </div>

      {!closed && (
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('exams.rename', lang)}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(t('exams.closeConfirm', lang))) return
              startTransition(async () => {
                setError(null)
                const result = await closeExam(exam.id)
                if (result.error) setError(result.error)
              })
            }}
            className="cursor-pointer rounded-full bg-alert-soft px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert/20 disabled:opacity-50"
          >
            {t('exams.close', lang)}
          </button>
        </span>
      )}
      {error && <p className="w-full text-sm text-alert-deep">{error}</p>}
    </div>
  )
}
