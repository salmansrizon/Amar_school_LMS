'use client'

import { useId, useState } from 'react'
import { NativeDialog } from '@/components/native-dialog'
import { t, type Lang } from '@/lib/i18n'

/** Controlled-trigger modal/overlay (issue #632) — an alternative to
 *  AddDetails's inline <details> expansion for cases where opening the panel
 *  must never shift surrounding layout (fixed inset-0 overlay, portalled in
 *  place rather than mounted inline). Children receive a `close` callback so
 *  a successful form submit can dismiss the modal itself, the modal's own
 *  counterpart to AddDetails's callers resetting the form on success. */
export function Modal({
  lang,
  triggerLabel,
  triggerClassName,
  title,
  onOpenChange,
  children,
}: {
  lang: Lang
  triggerLabel: string
  triggerClassName: string
  title: string
  /** Fires on every open/close transition, including a backdrop click or the
   *  X button — not just a caller-initiated `close()`. Lets a form reset its
   *  own state on dismissal without this component knowing anything about
   *  what it's showing. */
  onOpenChange?: (open: boolean) => void
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpenState] = useState(false)
  const setOpen = (next: boolean) => {
    setOpenState(next)
    onOpenChange?.(next)
  }
  const close = () => setOpen(false)
  const titleId = useId()
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        {triggerLabel}
      </button>
      <NativeDialog
        open={open}
        onRequestClose={close}
        labelledBy={titleId}
        className="max-h-[90vh] max-w-xl overflow-y-auto rounded-lg border border-line bg-paper p-4 text-ink shadow-card sm:p-6"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 id={titleId} className="text-lg font-bold">
            {title}
          </h3>
          <button
            type="button"
            onClick={close}
            aria-label={t('common.close', lang)}
            className="cursor-pointer rounded-full p-1 text-muted hover:bg-paper-muted hover:text-ink"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children(close)}
      </NativeDialog>
    </>
  )
}
