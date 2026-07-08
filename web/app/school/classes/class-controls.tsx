'use client'

import { useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { addClass, addRoom, addSubject, removeItem } from './actions'

type Entity = 'classes' | 'rooms' | 'subjects'

/** Wraps a create form: resets on success, surfaces the action's error. */
function CreateForm({
  children,
  action,
  submitLabel,
  className = 'grid gap-3 sm:grid-cols-2',
}: {
  children: React.ReactNode
  action: (fd: FormData) => Promise<{ error?: string }>
  submitLabel: string
  className?: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const result = await action(data)
          if (result.error) setError(result.error)
          else form.reset()
        })
      }}
    >
      {children}
      {error && <p className="text-sm text-alert-deep sm:col-span-2">{error}</p>}
      <button type="submit" disabled={pending} className={`${primaryBtnClass} sm:col-span-2`}>
        {submitLabel}
      </button>
    </form>
  )
}

function Field({
  name,
  label,
  optional,
  type = 'text',
  min,
  max,
  defaultValue,
  lang,
}: {
  name: string
  label: string
  optional?: boolean
  type?: string
  min?: number
  max?: number
  defaultValue?: string | number
  lang: Lang
}) {
  return (
    <div>
      <label className={labelClass} htmlFor={name}>
        {label} {optional && <span className="text-muted">{t('classes.optional', lang)}</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        min={min}
        max={max}
        defaultValue={defaultValue}
        required={!optional}
        className={inputClass}
      />
    </div>
  )
}

export function AddClassForm({ lang }: { lang: Lang }) {
  return (
    <CreateForm action={addClass} submitLabel={t('classes.addClass', lang)}>
      <Field name="name" label={t('common.name', lang)} lang={lang} />
      <Field name="section" label={t('classes.section', lang)} optional lang={lang} />
      <Field name="education_level" label={t('classes.educationLevel', lang)} optional lang={lang} />
      <Field name="group_department" label={t('classes.groupDept', lang)} optional lang={lang} />
    </CreateForm>
  )
}

export function AddRoomForm({ lang }: { lang: Lang }) {
  return (
    <CreateForm action={addRoom} submitLabel={t('classes.addRoom', lang)}>
      <Field name="name" label={t('common.name', lang)} lang={lang} />
      <Field name="capacity" label={t('classes.capacity', lang)} type="number" min={1} defaultValue={30} lang={lang} />
    </CreateForm>
  )
}

export function AddSubjectForm({ lang }: { lang: Lang }) {
  return (
    <CreateForm action={addSubject} submitLabel={t('classes.addSubject', lang)} className="grid gap-3 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="name">{t('common.name', lang)}</label>
        <input id="name" name="name" required className={inputClass} />
      </div>
      <Field name="code" label={t('classes.code', lang)} optional lang={lang} />
      <Field name="theory_marks" label={t('classes.theory', lang)} type="number" min={0} defaultValue={100} lang={lang} />
      <Field name="mcq_marks" label={t('classes.mcq', lang)} type="number" min={0} defaultValue={0} lang={lang} />
      <Field name="practical_marks" label={t('classes.practical', lang)} type="number" min={0} defaultValue={0} lang={lang} />
      <Field name="paper_count" label={t('classes.papers', lang)} type="number" min={1} max={4} defaultValue={1} lang={lang} />
    </CreateForm>
  )
}

export function DeleteButton({ entity, id, lang }: { entity: Entity; id: string; lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-alert-deep">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await removeItem(entity, id)
            if (result.error) setError(result.error)
          })
        }
        className="cursor-pointer rounded-full bg-alert-soft px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert/20 disabled:opacity-50"
      >
        {t('common.delete', lang)}
      </button>
    </span>
  )
}
