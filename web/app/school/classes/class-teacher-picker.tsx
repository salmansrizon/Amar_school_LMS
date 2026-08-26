'use client'

import { useState, useTransition } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { selectClass } from '@/components/ui/field'
import { setClassTeacher } from './actions'
import type { TeacherOption } from './class-controls'

// Lives in its own file rather than beside AddClassForm on purpose: issues #503
// and #504 are rewriting AddSubjectForm in class-controls.tsx right now, and a
// component sitting directly above it would collide on merge for no reason.

/** Inline Class Teacher assignment on a class row. There is no class edit form,
 *  and this is also the backfill path for classes that predate #443. */
export function ClassTeacherPicker({
  lang,
  classId,
  teachers,
  current,
}: {
  lang: Lang
  classId: string
  teachers: TeacherOption[]
  current: string | null
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div>
      <select
        aria-label={t('classes.classTeacher', lang)}
        defaultValue={current ?? ''}
        disabled={pending}
        onChange={(e) => {
          const value = e.target.value || null
          startTransition(async () => {
            setError(null)
            const result = await setClassTeacher(classId, value)
            if (result.error) setError(result.error)
          })
        }}
        className={selectClass()}
      >
        <option value="">{t('classes.classTeacherNone', lang)}</option>
        {teachers.map((teacher) => (
          <option key={teacher.id} value={teacher.id}>
            {teacher.full_name}
          </option>
        ))}
      </select>
      {!current && !error && (
        <span className="ml-2 rounded-full bg-sun-soft px-2 py-0.5 text-xs font-semibold text-sun-deep">
          {t('classes.classTeacherMissing', lang)}
        </span>
      )}
      {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
    </div>
  )
}
