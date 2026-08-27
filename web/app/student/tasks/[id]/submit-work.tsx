'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { ACCEPT_ATTRIBUTE, MAX_SUBMISSION_BYTES, rejectSubmission } from '@/lib/student/submissions'
import { recordSubmission, submissionUploadPath, withdrawSubmission } from '@/lib/student/submissions-source'

const REJECTION: Record<string, MessageKey> = {
  type: 'student.rejectType',
  size: 'student.rejectSize',
  count: 'student.rejectCount',
}

// Client-direct upload to the private submissions bucket, then record the row.
//
// The path comes from the server — the first two folders are what the storage
// policies key on, so letting the client choose it would be the whole hole. If
// the row insert then fails a cap check the object is removed again, so the
// orphan the publishing ticket had to retrofit never exists here.
export function SubmitWork({
  lang,
  publicationId,
  existingCount,
  disabled,
}: {
  lang: Lang
  publicationId: string
  existingCount: number
  disabled?: boolean
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return

    setError(null)
    const rejected = rejectSubmission(file, existingCount)
    if (rejected) return setError(t(REJECTION[rejected], lang))

    setBusy(true)
    const { path, error: pathError } = await submissionUploadPath(publicationId, file.type)
    if (!path) {
      setBusy(false)
      return setError(pathError === 'type' ? t('student.rejectType', lang) : (pathError ?? 'error'))
    }

    const supabase = createClient()
    const upload = await supabase.storage.from('submissions').upload(path, file)
    if (upload.error) {
      setBusy(false)
      return setError(upload.error.message)
    }

    const recorded = await recordSubmission({
      publicationId,
      storagePath: path,
      fileName: file.name,
      fileSize: file.size,
    })
    if (recorded.error) {
      // The row is the authority. If it refused, the object must not linger.
      await supabase.storage.from('submissions').remove([path])
      setBusy(false)
      return setError(recorded.error)
    }

    setBusy(false)
    router.refresh()
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={onPick}
      />
      <button
        type="button"
        disabled={busy || disabled}
        onClick={() => inputRef.current?.click()}
        className="cursor-pointer rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {busy ? t('student.uploading', lang) : t('student.submitWork', lang)}
      </button>
      {/* What will be accepted, said before the upload is rejected for it. */}
      <p className="mt-1.5 text-[11px] text-muted">
        {t('student.fileHint', lang).replace(
          '{size}',
          `${Math.round(MAX_SUBMISSION_BYTES / (1024 * 1024))}MB`,
        )}
      </p>
      {error && <p className="mt-2 text-xs text-alert-deep">{error}</p>}
    </div>
  )
}

export function WithdrawButton({
  lang,
  submissionId,
  publicationId,
}: {
  lang: Lang
  submissionId: string
  publicationId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await withdrawSubmission(submissionId, publicationId)
            if (result.error) setError(result.error)
            else router.refresh()
          })
        }
        className="cursor-pointer rounded-full border border-alert px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      >
        {t('student.withdraw', lang)}
      </button>
      {error && <span className="ml-2 text-xs text-alert-deep">{error}</span>}
    </span>
  )
}
