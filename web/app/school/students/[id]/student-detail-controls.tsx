'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { inputClass, labelClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import {
  archiveStudent,
  recordStudentPhoto,
  restoreStudent,
  studentPhotoPath,
  transferStudent,
} from '../actions'
import type { ShiftOption } from '../student-profile-form'

const MAX_PHOTO_BYTES = 2 * 1024 * 1024

export function PhotoUpload({ studentId, hasPhoto, lang }: { studentId: string; hasPhoto: boolean; lang: Lang }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="flex flex-col items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        const file = inputRef.current?.files?.[0]
        if (!file) return
        setError(null)
        if (!file.type.startsWith('image/')) {
          setError(t('students.imageOnly', lang))
          return
        }
        if (file.size > MAX_PHOTO_BYTES) {
          setError('Max 2 MB')
          return
        }
        setBusy(true)
        const { path, error: pathErr } = await studentPhotoPath(studentId)
        if (pathErr || !path) {
          setError(pathErr ?? 'Upload failed')
          setBusy(false)
          return
        }
        const supabase = createClient()
        const { error: upErr } = await supabase.storage
          .from('student-photos')
          .upload(path, file, { upsert: true, contentType: file.type })
        if (upErr) {
          setError(upErr.message)
          setBusy(false)
          return
        }
        const res = await recordStudentPhoto(studentId)
        setBusy(false)
        if (res.error) setError(res.error)
        else {
          if (inputRef.current) inputRef.current.value = ''
          router.refresh()
        }
      }}
    >
      {hasPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/student-photo?student=${studentId}`}
          alt=""
          className="h-24 w-24 rounded-lg border border-line object-cover"
        />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-line-strong text-3xl text-muted">
          👤
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" required className="max-w-[160px] text-xs" />
      <button type="submit" disabled={busy} className="rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
        {busy ? t('syllabus.uploading', lang) : t('students.uploadPhoto', lang)}
      </button>
      {error && <p className="text-xs text-alert-deep">{error}</p>}
    </form>
  )
}

export function ArchiveToggle({ studentId, archived, lang }: { studentId: string; archived: boolean; lang: Lang }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-alert-deep">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const res = archived ? await restoreStudent(studentId) : await archiveStudent(studentId)
            if (res.error) setError(res.error)
            else router.refresh()
          })
        }
        className={`rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50 ${
          archived
            ? 'bg-mint-soft text-mint-deep hover:bg-mint/20'
            : 'border border-line-strong hover:bg-paper-muted'
        }`}
      >
        {archived ? t('students.restore', lang) : t('students.archive', lang)}
      </button>
    </span>
  )
}

export function TransferForm({ studentId, shifts, lang }: { studentId: string; shifts: ShiftOption[]; lang: Lang }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const res = await transferStudent(studentId, data)
          if (res.error) setError(res.error)
          else {
            form.reset()
            router.refresh()
          }
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor="to_class">{t('students.class', lang)}</label>
        <input id="to_class" name="to_class" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="to_section">{t('students.section', lang)}</label>
        <input id="to_section" name="to_section" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="to_shift_id">{t('students.shift', lang)}</label>
        <select id="to_shift_id" name="to_shift_id" className={inputClass} defaultValue="">
          <option value="">—</option>
          {shifts.map((sh) => (
            <option key={sh.id} value={sh.id}>{sh.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="note">{t('students.transferNote', lang)}</label>
        <input id="note" name="note" className={inputClass} />
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-2">{error}</p>}
      <button type="submit" disabled={pending} className="rounded-full bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">
        {t('students.doTransfer', lang)}
      </button>
    </form>
  )
}
