'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { examBasicInfoComplete, examHasClass } from '@/lib/exam-setup'
import { withOrigin } from '@/lib/back-nav'
import { t, type Lang } from '@/lib/i18n'
import { addExam, closeExam } from './actions'
import { ExamAction, examActionClass } from './exam-action'
import { ExamDocumentsModal } from './exam-documents-modal'
import { Modal } from '@/components/modal'

// Exams II (issue #47) repurposes this file for the exams-list.html toolbar +
// row (search/class/status filter) — per-exam rename now lives on the Exam
// Setup detail page ([id]/setup-controls.tsx), so the old inline ExamRow is
// replaced. Map #366 cut the row down to four actions; CloseExamModal is no
// longer one of them and is now used only by the setup page's header.

/** Close Exam confirmation, per exam-close-confirm-modal.html: a dedicated
 * danger-styled dialog (not a bare window.confirm()) spelling out that
 * closing is permanent — issue #8's rule, unchanged, just surfaced properly. */
export function CloseExamModal({
  examId,
  examLabel,
  lang,
  triggerClassName,
}: {
  examId: string
  examLabel: string
  lang: Lang
  triggerClassName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        {t('exams.close', lang)}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-line bg-paper p-6 shadow-card">
            <h3 className="mb-3 text-lg font-bold">{t('exams.closeModalTitle', lang)}</h3>
            <p className="mb-1 text-sm">
              <strong>{examLabel}</strong>
            </p>
            <p className="mb-4 text-sm">{t('exams.closeModalBody', lang)}</p>
            <div className="mb-4 rounded-lg border border-alert bg-alert-soft p-4">
              <p className="text-sm font-semibold text-alert-deep">{t('exams.closeModalWarning', lang)}</p>
            </div>
            {error && <p className="mb-3 text-sm text-alert-deep">{error}</p>}
            <div className="flex justify-between gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="cursor-pointer rounded-full border border-line-strong px-4 py-1.5 text-sm font-semibold hover:bg-paper-muted"
              >
                {t('exams.closeModalCancel', lang)}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    setError(null)
                    const result = await closeExam(examId)
                    if (result.error) setError(result.error)
                    else {
                      setOpen(false)
                      router.refresh()
                    }
                  })
                }}
                className="cursor-pointer rounded-full bg-alert px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {t('exams.closeModalConfirm', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function AddExamForm({ lang }: { lang: Lang }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const result = await addExam(data)
          if (result.error) setError(result.error)
          else if (result.id) router.push(`/school/exams/${result.id}`)
        })
      }}
    >
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="exam_name">{t('exams.name', lang)}</label>
        <input id="exam_name" name="name" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="exam_year">{t('exams.year', lang)}</label>
        <input
          id="exam_year"
          name="exam_year"
          type="number"
          min={2000}
          max={2100}
          defaultValue={new Date().getFullYear()}
          required
          className={inputClass}
        />
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-3">{error}</p>}
      <button type="submit" disabled={pending} className={`${primaryBtnClass} sm:col-span-3`}>
        {t('exams.add', lang)}
      </button>
    </form>
  )
}

export interface ExamListItem {
  id: string
  name: string
  exam_year: number
  status: string
  class_id: string | null
  grading_scheme_id: string | null
  start_date: string | null
}

/** Wraps AddExamForm in the header's "New exam" modal (map 013 A3). Composed
 *  here, in the client module, because Modal's children is a render prop. */
export function AddExamModal({ lang, triggerClassName }: { lang: Lang; triggerClassName: string }) {
  return (
    <Modal lang={lang} triggerLabel={`+ ${t('exams.add', lang)}`} triggerClassName={triggerClassName} title={t('exams.add', lang)}>
      {() => <AddExamForm lang={lang} />}
    </Modal>
  )
}

/** Returning from a destination brings the row that launched it back into
 *  view (docs/010_exam_module.md §5) — a row anchor, not a pixel offset. The
 *  DataTable renders a phone card and a desktop row from one list, so the
 *  anchor is whichever of the two is actually displayed. Does not move focus. */
export function ScrollToExam({ examId }: { examId?: string }) {
  useEffect(() => {
    if (!examId) return
    const shown = Array.from(document.querySelectorAll<HTMLElement>(`[data-exam-row="${examId}"]`)).find(
      (el) => el.offsetParent !== null,
    )
    shown?.scrollIntoView({ block: 'center' })
  }, [examId])
  return null
}

/** Map #366 cut every exam row to the same four actions; map #373 restores Seat
 * Plan and Routine as direct actions, giving six in the order
 * docs/010_exam_module.md §1 fixes: Basic Info, Marks Entry, Co-Curricular,
 * Generate Seat Plan, Make Exam Routine, Documents. The two restored ones link
 * to the pages that already exist under [id]/seat-plan and [id]/routine — they
 * are not new features and must not be rebuilt.
 *
 * Gating is not uniform, and deliberately so. Marks Entry and the documents
 * need a class *and* a grading scheme; Co-Curricular, Seat Plan and Routine
 * need only the class, because that is all their pages ever read (subjects-for-
 * class, roll ranges).
 *
 * Every action carries the row's own address as `?from=` (`origin`, built by
 * the page from the live filters and this exam's id), so Back returns here
 * rather than unwinding through Basic Info (§4, §5). Closing an exam does not
 * hide the actions: every destination renders read-only when closed. */
export function ExamRowActions({ exam, origin, lang }: { exam: ExamListItem; origin: string; lang: Lang }) {
  const complete = examBasicInfoComplete(exam)
  const needsBasicInfo = complete ? undefined : t('exams.completeBasicInfoFirst', lang)
  const needsClass = examHasClass(exam) ? undefined : t('exams.selectClassFirst', lang)
  const action = (path: string) => withOrigin(`/school/exams/${exam.id}${path}`, origin)

  return (
    // data-exam-row: the anchor ScrollToExam restores, and the row e2e scopes to.
    <div data-exam-row={exam.id} className="flex flex-wrap items-center justify-end gap-2">
      <ExamAction href={action('')} label={t('examSetup.basicInfo', lang)} />
      <ExamAction href={action('/marks-entry')} label={t('exams.markEntry', lang)} reason={needsBasicInfo} />
      <ExamAction href={action('/cocurricular')} label={t('exams.cocurricular', lang)} reason={needsClass} />
      <ExamAction href={action('/seat-plan')} label={t('exams.generateSeatPlan', lang)} reason={needsClass} />
      <ExamAction href={action('/routine')} label={t('exams.makeRoutine', lang)} reason={needsClass} />
      {/* Delete is NOT here: docs/010_exam_module.md §1 fixes six actions on
          this row, in this order. It lives on Basic Info next to Close (#551). */}
      {complete ? (
        <ExamDocumentsModal
          examId={exam.id}
          examLabel={`${exam.name} (${exam.exam_year})`}
          origin={origin}
          lang={lang}
          triggerClassName={`cursor-pointer ${examActionClass()}`}
        />
      ) : (
        <ExamAction href="" label={t('examDocs.title', lang)} reason={needsBasicInfo} />
      )}
    </div>
  )
}
