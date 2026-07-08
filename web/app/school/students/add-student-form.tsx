'use client'

import { useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { addStudent } from './actions'

export function AddStudentForm({ lang }: { lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const result = await addStudent(data)
          if (result.error) setError(result.error)
          else form.reset()
        })
      }}
    >
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="full_name">{t('students.name', lang)}</label>
        <input id="full_name" name="full_name" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="class_name">{t('students.class', lang)}</label>
        <input id="class_name" name="class_name" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="section">{t('students.section', lang)}</label>
        <input id="section" name="section" className={inputClass} />
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-4">{error}</p>}
      <button type="submit" disabled={pending} className={`${primaryBtnClass} sm:col-span-4`}>
        {t('students.add', lang)}
      </button>
    </form>
  )
}
