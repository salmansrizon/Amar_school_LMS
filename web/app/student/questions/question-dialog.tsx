'use client'

import { useEffect, useId } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { NativeDialog } from '@/components/native-dialog'
import { t, type Lang } from '@/lib/i18n'

/** The conversation popup. Content is rendered by the server page; this only
 *  presents it and sends Escape, the backdrop and the X back to the list URL.
 *  Focus returns to the row link that opened it. */
export function QuestionDialog({
  lang,
  title,
  about,
  closeHref,
  focusId,
  children,
}: {
  lang: Lang
  title: string
  about: string | null
  closeHref: string
  focusId: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const titleId = useId()
  const close = () => router.replace(closeHref, { scroll: false })

  useEffect(
    () => () => {
      setTimeout(() => document.querySelector<HTMLElement>(`[data-view-link="${focusId}"]`)?.focus(), 0)
    },
    [focusId],
  )

  return (
    <NativeDialog
      open
      onRequestClose={close}
      labelledBy={titleId}
      className="max-h-[90dvh] max-w-2xl overflow-y-auto overscroll-contain rounded-lg border border-line bg-paper p-4 text-ink shadow-card sm:p-6"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="break-words text-lg font-bold">
            {title}
          </h2>
          {about && (
            <p className="text-xs text-muted">
              {t('student.questionAbout', lang)}: <span className="font-medium">{about}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={t('common.close', lang)}
          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-paper-muted hover:text-ink sm:size-9"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      {children}
    </NativeDialog>
  )
}
