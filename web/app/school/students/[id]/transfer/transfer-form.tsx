'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { sectionsForClass } from '@/lib/students'
import { fieldClass, fieldLabelClass } from '../../new/admission-form'
import { transferStudent } from '../../actions'

export function TransferForm({
  lang,
  studentId,
  classes,
  currentClass,
  currentSection,
}: {
  lang: Lang
  studentId: string
  classes: { name: string; section: string | null }[]
  currentClass: string | null
  currentSection: string | null
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // Pre-filled with the student's current class/section (mirrors the mockup).
  // Shift left the student side with issue #100: class + section carry the
  // grouping now.
  // pre-filling avoids relying on that and keeps the form honest about what
  // will actually be submitted.
  const [toClass, setToClass] = useState(currentClass ?? '')
  const classNames = [...new Set(classes.map((c) => c.name))]
  const sections = useMemo(() => sectionsForClass(classes, toClass), [classes, toClass])

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        data.set('id', studentId)
        startTransition(async () => {
          setError(null)
          const result = await transferStudent(data)
          if (result.error) {
            setError(result.error)
            return
          }
          form.reset()
          setToClass('')
          router.refresh()
        })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={fieldLabelClass}>{t('students.newClass', lang)}</label>
          <select
            name="to_class"
            required
            value={toClass}
            onChange={(e) => setToClass(e.target.value)}
            className={fieldClass}
          >
            <option value="">—</option>
            {classNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={fieldLabelClass}>{t('students.newSection', lang)}</label>
          {/* key remounts on class change so a stale section can't linger */}
          <select
            key={toClass}
            name="to_section"
            defaultValue={toClass === currentClass ? (currentSection ?? '') : ''}
            className={fieldClass}
          >
            <option value="">—</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-3">
          <label className={fieldLabelClass}>{t('students.reason', lang)}</label>
          <textarea name="note" rows={2} className={fieldClass} placeholder={t('students.reasonHint', lang)} />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-alert-deep">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-full bg-brand-500 px-5 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {t('students.confirmTransfer', lang)}
        </button>
      </div>
    </form>
  )
}
