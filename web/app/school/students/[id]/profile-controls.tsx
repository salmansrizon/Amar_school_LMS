'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Camera, Pencil, RotateCcw, Trash2, User } from 'lucide-react'
import { t, type Lang } from '@/lib/i18n'
import { ProfileFields, uploadPersonPhoto } from '../new/admission-form'
import { PHOTO_KINDS, type PhotoKind } from '@/lib/photos'
import { archiveStudent, restoreStudent, updateStudent } from '../actions'
import { ConfirmDialog } from '@/components/confirm-dialog'
import type { ClassCatalogueRow } from '@/lib/class-catalogue'

// 44px on a phone, the compact pill on a pointer device (#540). These two are
// the Upload Photo / Replace Photo and Archive / Restore controls the UAT pass
// measured at 26-30px.
const btnSecondary =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50 sm:min-h-9'
// Destructive tone for archive/delete triggers (#365).
const btnDanger =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-alert px-4 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50 sm:min-h-9'

/** Read-mode profile with an Edit toggle; edit reuses the admission sections. */
export function ProfileEditor({
  lang,
  student,
  classes,
  showYear = false,
  children,
}: {
  lang: Lang
  student: Record<string, string | boolean | number | null> & { id: string; full_name: string }
  classes: ClassCatalogueRow[]
  /** Academic Year segment on the Class dropdown (issue #621, map #609's
   *  recipe) — true only when the School has more than one started
   *  Academic Year. */
  showYear?: boolean
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
            {t('students.editProfile', lang)}
          </button>
        </div>
        {children}
      </div>
    )
  }

  return (
    <form
      noValidate // the server validates and answers in the UI language into the error line
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
          toast.success(t('students.toastSaved', lang))
          router.refresh()
        })
      }}
    >
      <ProfileFields lang={lang} classes={classes} defaults={student} showYear={showYear} />
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
  kind = 'student',
}: {
  lang: Lang
  // ponytail: the person's id — an Employee's when kind is 'employee'. Rename to
  // personId once the profile restyle has merged (kept to keep that merge small).
  studentId: string
  hasPhoto: boolean
  kind?: PhotoKind
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
    const uploadError = await uploadPersonPhoto(studentId, file, lang, kind)
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
    if (uploadError) setError(uploadError)
    else router.refresh()
  }

  return (
    <div className="text-center">
      <div className="relative mx-auto mb-4 w-fit">
        {hasPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed-URL redirect route; next/image can't optimize it
          <img
            src={`${PHOTO_KINDS[kind].api}${studentId}`}
            alt=""
            className="size-36 rounded-full border-4 border-brand-50 object-cover ring-1 ring-brand-100"
          />
        ) : (
          <div className="flex size-36 items-center justify-center rounded-full border-4 border-brand-50 bg-brand-100 text-brand-500 ring-1 ring-brand-100">
            <User className="size-16" aria-hidden />
            <span className="sr-only">{t('students.photo', lang)}</span>
          </div>
        )}
        <span
          aria-hidden
          className="absolute -right-2 -top-1 inline-flex size-8 items-center justify-center rounded-full border border-line bg-paper text-sm font-bold text-brand-600 shadow-sm"
        >
          #
        </span>
      </div>
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
        className={`${btnSecondary} w-full border-transparent bg-brand-50 text-brand-700 hover:bg-brand-100`}
      >
        <Camera className="size-3.5" aria-hidden />
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

  // Restore is non-destructive → a plain button. Archive is destructive → an
  // in-app ConfirmDialog (#365) instead of window.confirm.
  if (archived) {
    return (
      <span>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const res = await restoreStudent(studentId)
              if (res.error) setError(res.error)
              else router.refresh()
            })
          }
          className={btnSecondary}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          {t('students.restore', lang)}
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
          {t('students.archive', lang)}
        </>
      }
      triggerClassName={btnDanger}
      title={t('students.archive', lang)}
      body={t('students.archiveConfirm', lang)}
      confirmLabel={t('students.archive', lang)}
      cancelLabel={t('routine.cancel', lang)}
      onConfirm={async () => {
        const res = await archiveStudent(studentId)
        if (!res.error) {
          toast.success(t('students.toastArchived', lang))
          router.push('/school/students/archive')
        }
        return res
      }}
    />
  )
}
