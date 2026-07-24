'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { setStudentSubject, removeStudentSubject } from '../subject-assignment/actions'
import { selectClass } from '@/components/ui/field'

export interface AssignedSubject {
  subject_id: string
  name: string
  is_optional: boolean
}

export function StudentSubjects({
  studentId,
  assigned,
  available,
  lang,
}: {
  studentId: string
  assigned: AssignedSubject[]
  available: { id: string; name: string }[]
  lang: Lang
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const assignedIds = new Set(assigned.map((a) => a.subject_id))
  const unassigned = available.filter((s) => !assignedIds.has(s.id))

  function remove(subjectId: string) {
    startTransition(async () => {
      setError(null)
      const result = await removeStudentSubject(studentId, subjectId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  function toggleOptional(subjectId: string, isOptional: boolean) {
    const data = new FormData()
    data.set('student_id', studentId)
    data.set('subject_id', subjectId)
    if (isOptional) data.set('is_optional', 'on')
    startTransition(async () => {
      setError(null)
      const result = await setStudentSubject(data)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div>
      {error && <p className="mb-2 text-sm text-alert-deep">{error}</p>}
      {!assigned.length ? (
        <p className="mb-3 text-sm text-muted">{t('subjects.none', lang)}</p>
      ) : (
        <ul className="mb-3 divide-y divide-line">
          {assigned.map((a) => (
            <li key={a.subject_id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>{a.name}</span>
              <span className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-muted">
                  <input
                    type="checkbox"
                    disabled={pending}
                    checked={a.is_optional}
                    onChange={(e) => toggleOptional(a.subject_id, e.target.checked)}
                  />
                  {t('subjects.optional', lang)}
                </label>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(a.subject_id)}
                  className="cursor-pointer rounded-full bg-alert-soft px-2 py-0.5 text-xs font-semibold text-alert-deep disabled:opacity-50"
                >
                  {t('common.remove', lang)}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {unassigned.length > 0 && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const form = e.currentTarget
            const data = new FormData(form)
            data.set('student_id', studentId)
            startTransition(async () => {
              setError(null)
              const result = await setStudentSubject(data)
              if (result.error) setError(result.error)
              else {
                form.reset()
                router.refresh()
              }
            })
          }}
        >
          <select name="subject_id" required className={selectClass()}>
            <option value="">{t('subjects.addSubject', lang)}</option>
            {unassigned.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-muted">
            <input type="checkbox" name="is_optional" />
            {t('subjects.optional', lang)}
          </label>
          <button
            type="submit"
            disabled={pending}
            className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50"
          >
            {t('common.add', lang)}
          </button>
        </form>
      )}
    </div>
  )
}
