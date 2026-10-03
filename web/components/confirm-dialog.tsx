'use client'

import { useId, useState, useTransition } from 'react'
import { NativeDialog } from '@/components/native-dialog'

// Shared in-app confirm dialog (#365) — replaces native window.confirm for
// destructive actions (archive/delete) so they match the design system, like the
// exam CloseExamModal. Caller passes already-localized strings + an async
// onConfirm returning an optional { error }; the dialog surfaces the error and
// stays open on failure.
export function ConfirmDialog({
  triggerLabel,
  triggerClassName,
  triggerDisabled,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  children,
  confirmDisabled = false,
  confirmTone = 'alert',
}: {
  triggerLabel: React.ReactNode
  triggerClassName: string
  triggerDisabled?: boolean
  title: string
  body?: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => Promise<{ error?: string } | void>
  /** Extra dialog content under the body — a warning with a link, the publish readiness list. */
  children?: React.ReactNode
  /** The action cannot go ahead at all (the content says why). */
  confirmDisabled?: boolean
  /** `alert` for a destructive action (the default); `brand` otherwise. */
  confirmTone?: 'alert' | 'brand'
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const titleId = useId()

  return (
    <>
      <button type="button" disabled={triggerDisabled} onClick={() => setOpen(true)} className={triggerClassName}>
        {triggerLabel}
      </button>
      <NativeDialog
        open={open}
        onRequestClose={() => !pending && setOpen(false)}
        labelledBy={titleId}
        className="max-w-md rounded-lg border border-line bg-paper p-6 text-ink shadow-card"
      >
        <h3 id={titleId} className="mb-3 text-lg font-bold">
          {title}
        </h3>
        {body && <p className="mb-4 whitespace-pre-line text-sm text-muted">{body}</p>}
        {children}
        {error && <p className="mb-3 text-sm text-alert-deep">{error}</p>}
        <div className="flex justify-between gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => setOpen(false)}
            className="cursor-pointer rounded-full border border-line-strong px-4 py-1.5 text-sm font-semibold hover:bg-paper-muted disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={pending || confirmDisabled}
            onClick={() =>
              startTransition(async () => {
                setError(null)
                const res = await onConfirm()
                if (res?.error) setError(res.error)
                else setOpen(false)
              })
            }
            className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
              confirmTone === 'brand' ? 'bg-brand-600 hover:bg-brand-700' : 'bg-alert'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </NativeDialog>
    </>
  )
}
