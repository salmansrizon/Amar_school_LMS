'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import type { SubjectOption } from '@/lib/students'
import { bulkAssignSubjects } from './actions'

export function BulkAssignForm({
  classId,
  subjects,
  studentCount,
  lang,
}: {
  classId: string
  subjects: SubjectOption[]
  studentCount: number
  lang: Lang
}) {
  const router = useRouter()
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [optional, setOptional] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, id: string) {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSet(next)
  }

  return (
    <div className="rounded-lg border border-line bg-paper p-5 shadow-card">
      <p className="mb-3 text-sm text-muted">
        {t('subjects.studentsInClass', lang)}: <strong>{studentCount}</strong>
      </p>
      {!subjects.length ? (
        <p className="text-sm text-muted">{t('subjects.noSubjects', lang)}</p>
      ) : (
        <>
          <ul className="mb-4 divide-y divide-line">
            {subjects.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <label className="flex flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked.has(s.id)}
                    onChange={() => toggle(checked, setChecked, s.id)}
                  />
                  {s.name}
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <input
                    type="checkbox"
                    disabled={!checked.has(s.id)}
                    checked={optional.has(s.id)}
                    onChange={() => toggle(optional, setOptional, s.id)}
                  />
                  {t('subjects.optional', lang)}
                </label>
              </li>
            ))}
          </ul>
          {error && <p className="mb-2 text-sm text-alert-deep">{error}</p>}
          {done !== null && (
            <p className="mb-2 text-sm text-mint-deep">{t('subjects.assignedCount', lang)}: {done}</p>
          )}
          <button
            type="button"
            disabled={pending || !checked.size}
            onClick={() =>
              startTransition(async () => {
                setError(null)
                setDone(null)
                const result = await bulkAssignSubjects(classId, [...checked], [...optional])
                if (result.error) setError(result.error)
                else {
                  setDone(result.count ?? 0)
                  router.refresh()
                }
              })
            }
            className="cursor-pointer rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {pending ? t('subjects.assigning', lang) : t('subjects.assignAll', lang)}
          </button>
        </>
      )}
    </div>
  )
}
