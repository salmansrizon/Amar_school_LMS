'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { reachSentences } from '@/lib/school/teacher-reach'
import { createTeacher } from '../actions'

const field = 'h-10 w-full rounded-lg border border-line-strong px-3 text-sm focus:border-brand-500 focus:outline-none'
const label = 'mb-1 block text-xs font-semibold text-muted'

export function CreateTeacherForm({
  lang,
  classes,
}: {
  lang: Lang
  classes: { id: string; label: string; taken: boolean }[]
}) {
  const router = useRouter()
  const [classId, setClassId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const chosen = classes.find((c) => c.id === classId) ?? null
  // Derived from the choice, not from a permissions screen: ADR 0021 makes a Class
  // Teacher's reach follow from the assignment itself, so the Owner can be shown
  // the consequence before confirming rather than after logging in as her.
  const preview = reachSentences(
    { classTeacherOf: chosen ? [chosen.label] : [], teaches: [] },
    lang,
  )

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        start(async () => {
          setError(null)
          const result = await createTeacher(data)
          // A partial failure still reports the employee it made, so the Owner is
          // never told to start over on a record that already exists.
          if (result.error) {
            setError(result.error)
            if (result.employeeId) router.push(`/school/employees/${result.employeeId}`)
            return
          }
          router.push(`/school/employees/${result.employeeId}`)
        })
      }}
    >
      <section className="rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">{t('teacher.stepIdentity', lang)}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="full_name">{t('employees.name', lang)} *</label>
            <input id="full_name" name="full_name" required className={field} />
          </div>
          <div>
            <label className={label} htmlFor="category">{t('employees.category', lang)}</label>
            <input id="designation" name="category" className={field} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-1 font-bold">{t('teacher.stepLogin', lang)}</h2>
        <p className="mb-3 text-xs text-muted">{t('teacher.stepLoginHelp', lang)}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="email">{t('login.email', lang)} *</label>
            <input id="email" name="email" type="email" required className={field} autoComplete="off" />
          </div>
          <div>
            <label className={label} htmlFor="password">{t('login.password', lang)} *</label>
            <input id="password" name="password" type="password" required minLength={8} className={field} autoComplete="new-password" />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-1 font-bold">{t('teacher.stepClass', lang)}</h2>
        <p className="mb-3 text-xs text-muted">{t('teacher.stepClassHelp', lang)}</p>
        <select name="class_id" value={classId} onChange={(e) => setClassId(e.target.value)} className={field}>
          <option value="">{t('teacher.noClassYet', lang)}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
              {c.taken ? ` — ${t('teacher.classAlreadyHasTeacher', lang)}` : ''}
            </option>
          ))}
        </select>
      </section>

      <section className="rounded-lg border border-line bg-paper-muted p-5">
        <h2 className="mb-2 font-bold">{t('teacher.previewTitle', lang)}</h2>
        <ul className="grid gap-1 text-sm text-muted">
          {preview.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      {error && <p className="text-sm font-semibold text-alert-deep">{error}</p>}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {pending ? t('teacher.createSubmit', lang) : t('teacher.createSubmit', lang)}
        </button>
      </div>
    </form>
  )
}
