'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { CORRECTABLE_FIELDS } from '@/lib/student/corrections'
import { pendingPhotoPath, requestCorrection } from '@/lib/student/corrections-source'

const ERRORS: Record<string, MessageKey> = {
  field: 'student.correctionFieldBad',
  value: 'student.correctionValueBad',
  unchanged: 'student.correctionUnchanged',
}

/** Asking for a correction (#456).
 *
 *  Naming the field is the point: the Owner applies it in one action rather
 *  than reading prose and retyping. A photo is uploaded to the student's own
 *  pending folder and only becomes the live path when the Owner applies it —
 *  photo_path feeds the printed ID card, so it is never a live change. */
export function CorrectionForm({
  lang,
  current,
  labels,
}: {
  lang: Lang
  current: Record<string, string | null>
  labels: Record<string, string>
}) {
  const router = useRouter()
  const photoRef = useRef<HTMLInputElement>(null)
  const [field, setField] = useState<string>('student_mobile')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const isPhoto = field === 'photo_path'

  async function submitPhoto() {
    const file = photoRef.current?.files?.[0]
    if (!file) return setError(t('student.correctionValueBad', lang))
    setBusy(true)
    const { path, error: pathError } = await pendingPhotoPath(file.type)
    if (!path) {
      setBusy(false)
      return setError(pathError === 'type' ? t('student.rejectType', lang) : (pathError ?? 'error'))
    }
    const upload = await createClient().storage.from('student-photos').upload(path, file)
    if (upload.error) {
      setBusy(false)
      return setError(upload.error.message)
    }
    const data = new FormData()
    data.set('field', 'photo_path')
    data.set('requested_value', path)
    data.set('current_value', current.photo_path ?? '')
    const result = await requestCorrection(data)
    setBusy(false)
    if (result.error) return setError(ERRORS[result.error] ? t(ERRORS[result.error], lang) : result.error)
    setSent(true)
    router.refresh()
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        setSent(false)
        if (isPhoto) return void submitPhoto()

        const data = new FormData(e.currentTarget)
        data.set('current_value', current[field] ?? '')
        startTransition(async () => {
          const result = await requestCorrection(data)
          if (result.error) setError(ERRORS[result.error] ? t(ERRORS[result.error], lang) : result.error)
          else {
            setSent(true)
            router.refresh()
          }
        })
      }}
    >
      <label className="text-xs font-semibold text-muted">
        <span className="mb-1 block">{t('student.correctionField', lang)}</span>
        <select
          name="field"
          value={field}
          onChange={(e) => setField(e.target.value)}
          className="h-9 w-full rounded-sm border border-line-strong bg-paper px-2 text-sm"
        >
          {CORRECTABLE_FIELDS.map((f) => (
            <option key={f} value={f}>
              {labels[f] ?? f}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs font-semibold text-muted">
        <span className="mb-1 block">
          {isPhoto ? t('student.newPhoto', lang) : t('student.correctionValue', lang)}
        </span>
        {isPhoto ? (
          <input
            ref={photoRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="h-9 w-full text-sm"
          />
        ) : (
          <input
            name="requested_value"
            required
            className="h-9 w-full rounded-sm border border-line-strong bg-paper px-2 text-sm"
          />
        )}
      </label>

      <label className="text-xs font-semibold text-muted sm:col-span-2">
        <span className="mb-1 block">{t('student.correctionNote', lang)}</span>
        <input name="note" className="h-9 w-full rounded-sm border border-line-strong bg-paper px-2 text-sm" />
      </label>

      {error && <p className="text-sm text-alert-deep sm:col-span-2">{error}</p>}
      {sent && <p className="text-sm text-mint-deep sm:col-span-2">✓</p>}

      <button
        type="submit"
        disabled={pending || busy}
        className="cursor-pointer justify-self-start rounded-full bg-brand-500 px-5 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 sm:col-span-2"
      >
        {t('student.requestCorrection', lang)}
      </button>
    </form>
  )
}
