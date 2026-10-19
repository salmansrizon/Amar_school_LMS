'use client'

import { useState, useTransition } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { ComboboxField } from '@/components/ui/combobox-field'
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
      <ComboboxField
        aria-label={t('classes.classTeacher', lang)}
        defaultValue={current ?? ''}
        disabled={pending}
        onValueChange={(v) => {
          const value = v || null
          startTransition(async () => {
            setError(null)
            const result = await setClassTeacher(classId, value)
            if (result.error) setError(result.error)
          })
        }}
        options={[
          { value: '', label: t('classes.classTeacherNone', lang) },
          ...teachers.map((teacher) => ({ value: teacher.id, label: teacher.full_name })),
        ]}
      />
      {!current && !error && (
        <span className="ml-2 rounded-full bg-sun-soft px-2 py-0.5 text-xs font-semibold text-sun-deep">
          {t('classes.classTeacherMissing', lang)}
        </span>
      )}
      {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
    </div>
  )
}
