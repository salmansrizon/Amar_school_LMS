'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { classCatalogueOptions, type ClassCatalogueRow } from '@/lib/class-catalogue'
import { fieldClass, fieldLabelClass } from '../../new/admission-form'
import { transferStudent } from '../../actions'
import { selectClass } from '@/components/ui/field'

/** Class Offering picker (map #568/#582, issue #586) — the id-based analog
 *  of the old class-then-section text cascade. Submits class_offering_id,
 *  routed through set_student_enrollment (actions.ts's transferStudent).
 *
 *  Deliberately starts empty rather than pre-filled with the student's
 *  current Offering, unlike the old class/section version: a transition now
 *  always closes one Enrollment and opens another, so submitting the
 *  unchanged pre-fill would be a real (and silently roll-shifting) move
 *  rather than the no-op it used to be. The page header above already states
 *  where the student currently is, so nothing is lost by making the
 *  destination a deliberate choice. */
export function TransferForm({
  lang,
  studentId,
  classOfferings,
}: {
  lang: Lang
  studentId: string
  classOfferings: ClassCatalogueRow[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [toOffering, setToOffering] = useState('')
  const options = classCatalogueOptions(classOfferings)

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
          setToOffering('')
          router.refresh()
        })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className={fieldLabelClass}>{t('students.newClass', lang)}</label>
          <select
            name="class_offering_id"
            required
            value={toOffering}
            onChange={(e) => setToOffering(e.target.value)}
            className={selectClass({ size: 'md', fullWidth: true })}
          >
            <option value="">—</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
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
