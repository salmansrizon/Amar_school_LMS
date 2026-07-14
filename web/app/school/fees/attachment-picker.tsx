'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { labelClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { accountingAttachmentUploadPath, type AttachmentKind } from './attachment-actions'

export interface AttachmentMeta {
  path: string
  name: string
  mime: string
  size: number
}

// Mirrors the DB-enforced caps (0055's enforce_attachment_cap): 500KB image,
// 5MB PDF (PRD §7). These are only the UI's early check — the trigger is the
// real authority.
const MAX_IMAGE_BYTES = 512000
const MAX_PDF_BYTES = 5242880

function extFor(mime: string): string | null {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'application/pdf') return 'pdf'
  return null
}

/** Shared attachment file input for vouchers and assets (issue #35, code
 *  review: this used to be duplicated near-identically in
 *  voucher-controls.tsx and asset-controls.tsx). Validates type/size,
 *  uploads client-side straight to Storage (the syllabus/gallery pattern,
 *  0026/0041), and reports the uploaded object's metadata via onUploaded.
 *  The parent form attaches that metadata to its own FormData on submit, and
 *  remounts this component with a fresh `key` after a successful save to
 *  clear the file input. */
export function AttachmentPicker({
  kind,
  lang,
  onUploaded,
  onUploadingChange,
}: {
  kind: AttachmentKind
  lang: Lang
  onUploaded: (meta: AttachmentMeta) => void
  onUploadingChange?: (uploading: boolean) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  function setUploadingState(value: boolean) {
    setUploading(value)
    onUploadingChange?.(value)
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const ext = extFor(file.type)
    if (!ext) {
      setError(t('vouchers.badType', lang))
      return
    }
    const cap = file.type.startsWith('image/') ? MAX_IMAGE_BYTES : MAX_PDF_BYTES
    if (file.size > cap) {
      setError(t('vouchers.tooBig', lang))
      return
    }
    setUploadingState(true)
    const { path, error: pathErr } = await accountingAttachmentUploadPath(kind, ext)
    if (pathErr || !path) {
      setError(pathErr ?? 'Upload failed')
      setUploadingState(false)
      return
    }
    const supabase = createClient()
    const { error: upErr } = await supabase.storage
      .from('accounting-attachments')
      .upload(path, file, { contentType: file.type })
    setUploadingState(false)
    if (upErr) {
      setError(upErr.message)
      return
    }
    setFileName(file.name)
    onUploaded({ path, name: file.name, mime: file.type, size: file.size })
  }

  return (
    <div>
      <label className={labelClass}>{t('vouchers.attachFile', lang)}</label>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={onPick}
        disabled={uploading}
        className="w-full text-sm"
      />
      {fileName && <p className="mt-1 text-xs text-muted">📎 {fileName}</p>}
      {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
    </div>
  )
}
