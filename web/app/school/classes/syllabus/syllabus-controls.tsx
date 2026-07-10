'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { t, type Lang } from '@/lib/i18n'
import { deleteSyllabus, recordSyllabus, syllabusUploadPath } from './actions'

const MAX_BYTES = 10 * 1024 * 1024

const tdClass = 'px-3 py-2 text-sm'
const btnSecondary =
  'cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted disabled:opacity-50'

/** One row of the "Existing Syllabus Files" table (syllabus-upload.html):
 *  Class | Current File | Uploaded On | Size | Actions. */
export function SyllabusRow({
  classId,
  classLabel,
  fileName,
  uploadedOn,
  size,
  lang,
}: {
  classId: string
  classLabel: string
  fileName: string | null
  uploadedOn: string | null
  size: string | null
  lang: Lang
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dash = <span className="text-muted">—</span>

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    if (file.type !== 'application/pdf') {
      setError(t('syllabus.pdfOnly', lang))
      return
    }
    if (file.size > MAX_BYTES) {
      setError(t('syllabus.tooBig', lang))
      return
    }
    setBusy(true)
    // Ask the server for the canonical path (derived from the caller's School),
    // then upload the bytes straight to Storage; RLS still guards the folder.
    const { path, error: pathErr } = await syllabusUploadPath(classId)
    if (pathErr || !path) {
      setError(pathErr ?? 'Upload failed')
      setBusy(false)
      return
    }
    const supabase = createClient()
    const { error: upErr } = await supabase.storage
      .from('syllabus')
      .upload(path, file, { upsert: true, contentType: 'application/pdf' })
    if (upErr) {
      setError(upErr.message)
      setBusy(false)
      return
    }
    const res = await recordSyllabus(classId, file.name, file.size)
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
    if (res.error) {
      setError(res.error)
      return
    }
    router.refresh()
  }

  async function onRemove() {
    if (!window.confirm(t('syllabus.confirmRemove', lang))) return
    setError(null)
    setBusy(true)
    const res = await deleteSyllabus(classId)
    setBusy(false)
    if (res.error) setError(res.error)
    else router.refresh()
  }

  return (
    <tr className="border-b border-line">
      <td className={`${tdClass} font-medium`}>{classLabel}</td>
      <td className={tdClass}>
        {fileName ?? <span className="text-muted">{t('syllabus.none', lang)}</span>}
      </td>
      <td className={tdClass}>{uploadedOn ?? dash}</td>
      <td className={tdClass}>{size ?? dash}</td>
      <td className={tdClass}>
        <div className="flex flex-wrap items-center gap-2">
          {fileName && (
            <a
              href={`/api/syllabus?class=${classId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={btnSecondary}
            >
              {t('syllabus.download', lang)}
            </a>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={onPick}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className={
              fileName
                ? btnSecondary
                : 'cursor-pointer rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
            }
          >
            {busy
              ? t('syllabus.uploading', lang)
              : fileName
                ? t('syllabus.replace', lang)
                : t('syllabus.upload', lang)}
          </button>
          {fileName && (
            <button
              type="button"
              disabled={busy}
              onClick={onRemove}
              className="cursor-pointer rounded-full bg-alert-soft px-3 py-1 text-xs font-semibold text-alert-deep disabled:opacity-50"
            >
              {t('syllabus.remove', lang)}
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
      </td>
    </tr>
  )
}
