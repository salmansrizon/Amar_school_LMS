'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { ProfileFields, uploadStudentPhoto } from '../new/admission-form'
import { archiveStudent, restoreStudent, updateStudent } from '../actions'

const btnSecondary =
  'cursor-pointer rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50'

/** Read-mode profile with an Edit toggle; edit reuses the admission sections. */
export function ProfileEditor({
  lang,
  student,
  classes,
  shifts,
  children,
}: {
  lang: Lang
  student: Record<string, string | boolean | number | null> & { id: string; full_name: string }
  classes: { name: string; section: string | null }[]
  shifts: { id: string; name: string }[]
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
            {t('students.editProfile', lang)}
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
        data.set('id', student.id)
        startTransition(async () => {
          setError(null)
          const result = await updateStudent(data)
          if (result.error) {
            setError(result.error)
            return
          }
          setEditing(false)
          router.refresh()
        })
      }}
    >
      <ProfileFields lang={lang} classes={classes} shifts={shifts} defaults={student} />
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

/** Photo card: shows the current photo (signed-URL route) + upload/replace. */
export function PhotoControl({
  lang,
  studentId,
  hasPhoto,
}: {
  lang: Lang
  studentId: string
  hasPhoto: boolean
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setBusy(true)
    const uploadError = await uploadStudentPhoto(studentId, file, lang)
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
    if (uploadError) setError(uploadError)
    else router.refresh()
  }

  return (
    <div className="text-center">
      {hasPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed-URL redirect route; next/image can't optimize it
        <img
          src={`/api/student-photo?student=${studentId}`}
          alt=""
          className="mx-auto mb-2 h-28 w-28 rounded-md border border-line object-cover"
        />
      ) : (
        <div className="mx-auto mb-2 flex h-28 w-28 items-center justify-center rounded-md border border-dashed border-line-strong text-xs text-muted">
          {t('students.photo', lang)}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onPick}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={btnSecondary}
      >
        {busy
          ? t('syllabus.uploading', lang)
          : hasPhoto
            ? t('students.replacePhoto', lang)
            : t('students.uploadPhoto', lang)}
      </button>
      {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
    </div>
  )
}

/** Archive (soft) / Restore toggle for the profile header. */
export function ArchiveToggle({
  lang,
  studentId,
  archived,
}: {
  lang: Lang
  studentId: string
  archived: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onClick() {
    if (!archived && !window.confirm(t('students.archiveConfirm', lang))) return
    startTransition(async () => {
      setError(null)
      const res = archived ? await restoreStudent(studentId) : await archiveStudent(studentId)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <span>
      <button type="button" disabled={pending} onClick={onClick} className={btnSecondary}>
        {archived ? t('students.restore', lang) : t('students.archive', lang)}
      </button>
      {error && <span className="ml-2 text-xs text-alert-deep">{error}</span>}
    </span>
  )
}
