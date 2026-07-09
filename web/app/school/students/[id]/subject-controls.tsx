'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { assignStudentSubject, removeStudentSubject } from '../subject-actions'
import { sendBehaviourSms } from '../behaviour-sms-action'

export interface SubjectOption {
  id: string
  name: string
}
export interface Assignment {
  subject_id: string
  is_optional: boolean
}

export function SubjectsSection({
  studentId,
  allSubjects,
  assigned,
  lang,
}: {
  studentId: string
  allSubjects: SubjectOption[]
  assigned: Assignment[]
  lang: Lang
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const nameOf = (id: string) => allSubjects.find((s) => s.id === id)?.name ?? id
  const assignedIds = new Set(assigned.map((a) => a.subject_id))
  const available = allSubjects.filter((s) => !assignedIds.has(s.id))

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      setError(null)
      const res = await fn()
      if (res.error) setError(res.error)
      else router.refresh()
    })

  return (
    <div>
      {!assigned.length ? (
        <p className="text-sm text-muted">{t('students.noSubjects', lang)}</p>
      ) : (
        <ul className="mb-3 flex flex-wrap gap-2">
          {assigned.map((a) => (
            <li
              key={a.subject_id}
              className="flex items-center gap-2 rounded-full border border-line-strong px-3 py-1 text-xs"
            >
              <span className="font-medium">{nameOf(a.subject_id)}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => assignStudentSubject(studentId, a.subject_id, !a.is_optional))}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  a.is_optional ? 'bg-sun-soft text-sun-deep' : 'bg-mint-soft text-mint-deep'
                }`}
              >
                {a.is_optional ? t('students.optional', lang) : t('students.compulsory', lang)}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => removeStudentSubject(studentId, a.subject_id))}
                className="text-alert-deep"
                aria-label="remove"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const data = new FormData(e.currentTarget)
            const subjectId = String(data.get('subject_id') ?? '')
            if (!subjectId) return
            run(() => assignStudentSubject(studentId, subjectId, data.get('is_optional') != null))
          }}
        >
          <select name="subject_id" required className={`${inputClass} max-w-[220px]`} defaultValue="">
            <option value="">{t('students.assignSubject', lang)}</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" name="is_optional" /> {t('students.markOptional', lang)}
          </label>
          <button type="submit" disabled={pending} className="rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
            {t('common.add', lang)}
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-xs text-alert-deep">{error}</p>}
    </div>
  )
}

export function SendBehaviourSmsButton({ entryId, lang }: { entryId: string; lang: Lang }) {
  const [state, setState] = useState<'idle' | 'sent' | string>('idle')
  const [pending, startTransition] = useTransition()
  return (
    <span className="flex items-center gap-2">
      {state === 'sent' && <span className="text-xs text-mint-deep">{t('students.smsSent', lang)}</span>}
      {state !== 'idle' && state !== 'sent' && <span className="text-xs text-alert-deep">{state}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await sendBehaviourSms(entryId)
            setState(res.error ? res.error : 'sent')
          })
        }
        className="rounded-full border border-line-strong px-2 py-0.5 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50"
      >
        {t('students.sendSms', lang)}
      </button>
    </span>
  )
}
