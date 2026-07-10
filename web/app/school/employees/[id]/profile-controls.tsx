'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { ProfileFields } from '../new/create-form'
import { archiveEmployee, restoreEmployee, updateEmployee } from '../actions'

const btnSecondary =
  'cursor-pointer rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50'

/** Read-mode profile with an Edit toggle; edit reuses the create-form sections. */
export function ProfileEditor({
  lang,
  employee,
  children,
}: {
  lang: Lang
  employee: Record<string, string | number | null> & { id: string; full_name: string }
  children: React.ReactNode // read-mode profile sections (server-rendered)
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!editing) {
    return (
      <div>
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={() => setEditing(true)} className={btnSecondary}>
            {t('employees.editProfile', lang)}
          </button>
        </div>
        {children}
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        data.set('id', employee.id)
        startTransition(async () => {
          setError(null)
          const result = await updateEmployee(data)
          if (result.error) {
            setError(result.error)
            return
          }
          setEditing(false)
          router.refresh()
        })
      }}
    >
      <ProfileFields lang={lang} defaults={employee} />
      {error && <p className="mb-3 text-sm text-alert-deep">{error}</p>}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setEditing(false)} className={btnSecondary}>
          {t('routine.cancel', lang)}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-full bg-brand-500 px-5 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {t('behaviour.save', lang)}
        </button>
      </div>
    </form>
  )
}

/** Archive (soft) / Restore toggle for the profile header. */
export function ArchiveToggle({
  lang,
  employeeId,
  archived,
}: {
  lang: Lang
  employeeId: string
  archived: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onClick() {
    if (!archived && !window.confirm(t('employees.archiveConfirm', lang))) return
    startTransition(async () => {
      setError(null)
      const res = archived ? await restoreEmployee(employeeId) : await archiveEmployee(employeeId)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <span>
      <button type="button" disabled={pending} onClick={onClick} className={btnSecondary}>
        {archived ? t('employees.restore', lang) : t('employees.archive', lang)}
      </button>
      {error && <span className="ml-2 text-xs text-alert-deep">{error}</span>}
    </span>
  )
}
