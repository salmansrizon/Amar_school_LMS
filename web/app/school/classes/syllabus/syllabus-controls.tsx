'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { t, type Lang } from '@/lib/i18n'
import { deleteSyllabus, recordSyllabus, syllabusUploadPath } from './actions'

const MAX_BYTES = 10 * 1024 * 1024

export function SyllabusRow({
  classId,
  className,
  section,
  fileName,
  lang,
}: {
  classId: string
  className: string
  section: string | null
  fileName: string | null
  lang: Lang
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removing, startRemove] = useTransition()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const file = inputRef.current?.files?.[0]
    if (!file) return
    setError(null)
    if (file.type !== 'application/pdf') {
      setError(t('syllabus.pdfOnly', lang))
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Max 10 MB')
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
    const res = await recordSyllabus(classId, file.name)
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    if (inputRef.current) inputRef.current.value = ''
    router.refresh()
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <span className="text-sm font-medium">
          {className}
          {section ? <span className="text-muted"> · {section}</span> : null}
        </span>
        <span className="block text-xs text-muted">
          {t('syllabus.current', lang)}: {fileName ?? t('syllabus.none', lang)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {fileName && (
          <a
            href={`/api/syllabus?class=${classId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('syllabus.view', lang)}
          </a>
        )}
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            required
            className="max-w-[180px] text-xs file:mr-2 file:rounded-full file:border-0 file:bg-brand-50 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-brand-700"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? t('syllabus.uploading', lang) : fileName ? t('syllabus.replace', lang) : t('syllabus.upload', lang)}
          </button>
        </form>
        {fileName && (
          <button
            type="button"
            disabled={removing}
            onClick={() =>
              startRemove(async () => {
                setError(null)
                const res = await deleteSyllabus(classId)
                if (res.error) setError(res.error)
                else router.refresh()
              })
            }
            className="rounded-full bg-alert-soft px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert/20 disabled:opacity-50"
          >
            {t('syllabus.remove', lang)}
          </button>
        )}
      </div>
      {error && <p className="w-full text-right text-xs text-alert-deep">{error}</p>}
    </li>
  )
}
