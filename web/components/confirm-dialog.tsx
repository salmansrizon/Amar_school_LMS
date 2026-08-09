'use client'

import { useState, useTransition } from 'react'

// Shared in-app confirm dialog (#365) — replaces native window.confirm for
// destructive actions (archive/delete) so they match the design system, like the
// exam CloseExamModal. Caller passes already-localized strings + an async
// onConfirm returning an optional { error }; the dialog surfaces the error and
// stays open on failure.
export function ConfirmDialog({
  triggerLabel,
  triggerClassName,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
}: {
  triggerLabel: string
  triggerClassName: string
  title: string
  body?: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => Promise<{ error?: string } | void>
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        {triggerLabel}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-line bg-paper p-6 shadow-card">
            <h3 className="mb-3 text-lg font-bold">{title}</h3>
            {body && <p className="mb-4 text-sm text-muted">{body}</p>}
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
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setError(null)
                    const res = await onConfirm()
                    if (res?.error) setError(res.error)
                    else setOpen(false)
                  })
                }
                className="cursor-pointer rounded-full bg-alert px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
