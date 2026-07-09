'use client'

import { useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { bulkAssignClassSubject } from '../subject-actions'

export function BulkAssignForm({
  classes,
  subjects,
  lang,
}: {
  classes: string[]
  subjects: { id: string; name: string }[]
  lang: Lang
}) {
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setMsg({})
          const res = await bulkAssignClassSubject(data)
          if (res.error) setMsg({ error: res.error })
          else setMsg({ ok: `${res.count} ${t('students.assignedCount', lang)}` })
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor="class_name">{t('students.pickClass', lang)}</label>
        <select id="class_name" name="class_name" required className={inputClass} defaultValue="">
          <option value="">—</option>
          {classes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="subject_id">{t('students.pickSubject', lang)}</label>
        <select id="subject_id" name="subject_id" required className={inputClass} defaultValue="">
          <option value="">—</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="is_optional" /> {t('students.markOptional', lang)}
      </label>
      {msg.error && <p className="text-sm text-alert-deep sm:col-span-2">{msg.error}</p>}
      {msg.ok && <p className="text-sm text-mint-deep sm:col-span-2">{msg.ok}</p>}
      <button type="submit" disabled={pending} className={`${primaryBtnClass} sm:col-span-2`}>
        {t('students.assignAll', lang)}
      </button>
    </form>
  )
}
