'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { withOrigin } from '@/lib/back-nav'

// Map #366 moves the Exam Documents index (issue #99) out of the Basic Info
// page's bottom card and into a modal, so it is reachable from the exam row
// itself as well as from Basic Info's header. Still deliberately an index over
// routes that already exist — not a hub route, not new architecture. The dialog
// shape mirrors CloseExamModal (exam-controls.tsx) so both popups match.

/** Every printable an exam has, in the order a school produces them. */
const EXAM_DOCUMENTS: { href: string; label: MessageKey; hint: MessageKey }[] = [
  { href: '/routine/print', label: 'examDocs.routine', hint: 'examDocs.routineHint' },
  { href: '/seat-plan/print', label: 'examDocs.seatPlan', hint: 'examDocs.seatPlanHint' },
  { href: '/admit-cards', label: 'examDocs.admitCards', hint: 'examDocs.admitCardsHint' },
  { href: '/attendance-sheet', label: 'examDocs.attendanceSheet', hint: 'examDocs.attendanceSheetHint' },
  { href: '/printables', label: 'examDocs.printables', hint: 'examDocs.printablesHint' },
  { href: '/result-book', label: 'examDocs.resultBook', hint: 'examDocs.resultBookHint' },
  { href: '/print-all', label: 'examDocs.printAll', hint: 'examDocs.printAllHint' },
]

/** A document's address, carrying the origin the modal was opened from so the
 *  destination's Back returns there (docs/010_exam_module.md §2, §4). */
function docHref(examId: string, path: string, origin?: string): string {
  const href = `/school/exams/${examId}${path}`
  return origin ? withOrigin(href, origin) : href
}

export function ExamDocumentsModal({
  examId,
  examLabel,
  origin,
  lang,
  triggerClassName,
}: {
  examId: string
  examLabel: string
  /** Where the destinations should return to — the exam row that opened this,
   *  or Basic Info's header. Omitted, each destination falls back to its own
   *  structural parent, which is the pre-map-#373 behaviour. */
  origin?: string
  lang: Lang
  triggerClassName: string
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        {t('examDocs.title', lang)}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('examDocs.title', lang)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-line bg-paper p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold">{t('examDocs.title', lang)}</h3>
            <p className="mb-3 text-sm text-muted">{examLabel}</p>
            <ul className="-mx-1 flex-1 divide-y divide-line overflow-y-auto px-1">
              {EXAM_DOCUMENTS.map((doc) => (
                <li key={doc.href} className="flex items-start justify-between gap-4 py-2">
                  <div>
                    <p className="text-sm font-semibold">{t(doc.label, lang)}</p>
                    <p className="text-xs text-muted">{t(doc.hint, lang)}</p>
                  </div>
                  <Link
                    href={docHref(examId, doc.href, origin)}
                    onClick={() => setOpen(false)}
                    className="shrink-0 text-sm text-brand-600 hover:underline"
                  >
                    {t('examDocs.open', lang)}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="cursor-pointer rounded-full border border-line-strong px-4 py-1.5 text-sm font-semibold hover:bg-paper-muted"
              >
                {t('examDocs.close', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
