'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { t, type Lang } from '@/lib/i18n'
import { ProfileFields } from '../new/create-form'
import { archiveEmployee, restoreEmployee, updateEmployee } from '../actions'
import { ConfirmDialog } from '@/components/confirm-dialog'
import type { StaffLoginState } from '@/lib/staff-login'

const btnSecondary =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50'
// Destructive tone for archive/delete triggers (#365).
const btnDanger =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-alert px-4 py-1.5 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50'

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
            <Pencil className="size-3.5" aria-hidden />
            {t('employees.editProfile', lang)}
          </button>
        </div>
        {children}
      </div>
    )
  }

  return (
    <form
      noValidate // server answers in the UI language into the error line below
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
          toast.success(t('employees.toastSaved', lang))
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
  staffLoginId,
  loginState = 'unavailable',
}: {
  lang: Lang
  employeeId: string
  archived: boolean
  /** The linked Staff login's profile id, when there is one and the viewer may
   *  open the Staff page — archiving the employee does NOT touch that login,
   *  so the confirm says so and points at where to turn it off. */
  staffLoginId?: string | null
  /** #688: 'enabled' offers "also disable the login" (ticked by default);
   *  'unavailable' (migration 0241 not applied) keeps the plain warning;
   *  'disabled' needs nothing. */
  loginState?: StaffLoginState
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [disableLogin, setDisableLogin] = useState(true)
  const canDisableLogin = Boolean(staffLoginId) && loginState === 'enabled'

  // Restore is non-destructive → plain button. Archive → in-app ConfirmDialog (#365).
  if (archived) {
    return (
      <span>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const res = await restoreEmployee(employeeId)
              if (res.error) return setError(res.error)
              // #688: restoring does not turn a disabled Staff login back on.
              if (res.notice) toast.warning(res.notice)
              router.refresh()
            })
          }
          className={btnSecondary}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          {t('employees.restore', lang)}
        </button>
        {error && <span className="ml-2 text-xs text-alert-deep">{error}</span>}
      </span>
    )
  }

  return (
    <ConfirmDialog
      triggerLabel={
        <>
          <Trash2 className="size-3.5" aria-hidden />
          {t('employees.archive', lang)}
        </>
      }
      triggerClassName={btnDanger}
      title={t('employees.archive', lang)}
      body={t('employees.archiveConfirm', lang)}
      confirmLabel={t('employees.archive', lang)}
      cancelLabel={t('routine.cancel', lang)}
      onConfirm={async () => {
        const res = await archiveEmployee(employeeId, canDisableLogin && disableLogin)
        if (!res.error) {
          // Archived either way; a warning means the login is still on.
          if (res.warning) toast.warning(res.warning)
          else toast.success(t('employees.toastArchived', lang))
          router.push('/school/employees/archive')
        }
        return res
      }}
    >
      {canDisableLogin ? (
        <label className="mb-4 flex cursor-pointer items-start gap-2 rounded-md bg-sun-soft px-3 py-2 text-sm text-sun-deep">
          <input
            type="checkbox"
            checked={disableLogin}
            onChange={(e) => setDisableLogin(e.target.checked)}
            className="mt-0.5 size-4"
          />
          <span>{t('employees.archiveDisableLogin', lang)}</span>
        </label>
      ) : staffLoginId && loginState !== 'disabled' ? (
        <p className="mb-4 rounded-md bg-sun-soft px-3 py-2 text-sm text-sun-deep">
          {t('employees.archiveLoginWarning', lang)}{' '}
          <Link href={`/school/staff/${staffLoginId}`} className="font-semibold underline">
            {t('employees.archiveLoginLink', lang)}
          </Link>
        </p>
      ) : null}
    </ConfirmDialog>
  )
}
