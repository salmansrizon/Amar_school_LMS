'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { examBasicInfoComplete, examHasClass, filterExams } from '@/lib/exam-setup'
import { withOrigin } from '@/lib/back-nav'
import { t, type Lang } from '@/lib/i18n'
import { addExam, closeExam } from './actions'
import { ExamAction, examActionClass } from './exam-action'
import { ExamDocumentsModal } from './exam-documents-modal'
import { selectClass } from '@/components/ui/field'

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

export interface ClassOption {
  id: string
  name: string
  section: string | null
}

/** Search + class/status filter toolbar over an already-fetched page of
 * exams, per exams-list.html — filtering happens client-side (filterExams). */
export function ExamsListClient({
  exams,
  classes,
  lang,
}: {
  exams: ExamListItem[]
  classes: ClassOption[]
  lang: Lang
}) {
  const [query, setQuery] = useState('')
  const [classId, setClassId] = useState('')
  const [status, setStatus] = useState('')
  const classById = new Map(classes.map((c) => [c.id, c]))
  const filtered = useMemo(() => filterExams(exams, query, classId, status), [exams, query, classId, status])

  // The address a destination should come back to: this list, with the filters
  // as they stand right now and the row that was clicked. Snapshotted per link
  // rather than synced to the URL on every keystroke — in the App Router that
  // would mean a server round-trip per character (map #373).
  const originFor = (examId: string) => {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (classId) params.set('class', classId)
    if (status) params.set('status', status)
    params.set('exam', examId)
    return `/school/exams?${params.toString()}`
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('exams.searchPlaceholder', lang)}
          className={`${inputClass} max-w-xs`}
        />
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className={`${selectClass({ size: 'md', fullWidth: true })} max-w-48`}>
          <option value="">{t('exams.allClasses', lang)}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.section ? ` - ${c.section}` : ''}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${selectClass({ size: 'md', fullWidth: true })} max-w-40`}>
          <option value="">{t('exams.allStatus', lang)}</option>
          <option value="open">{t('exams.open', lang)}</option>
          <option value="closed">{t('exams.closed', lang)}</option>
        </select>
      </div>

      {!filtered.length ? (
        <p className="text-sm text-muted">{t('exams.none', lang)}</p>
      ) : (
        <ul className="divide-y divide-line">
          {filtered.map((exam) => (
            <li key={exam.id} className="py-3">
              <ExamListRow
                exam={exam}
                classLabel={classLabelOf(classById.get(exam.class_id ?? ''))}
                origin={originFor(exam.id)}
                lang={lang}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function classLabelOf(cls: ClassOption | undefined): string | null {
  if (!cls) return null
  return cls.section ? `${cls.name} - ${cls.section}` : cls.name
}

/** DOM id of an exam row. Returning from a destination scrolls this back into
 *  view rather than landing at the top of a long list (docs/010_exam_module.md
 *  §5, which prefers a row anchor over a pixel offset — an anchor survives the
 *  list re-rendering or the exam changing status; an offset does not). */
export function examRowAnchorId(examId: string): string {
  return `exam-${examId}`
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
 * class, roll ranges). #366 gated Seat Plan and Routine on the grading scheme
 * too and knowingly filed the contradiction as "revisit if it bites" — putting
 * them on the row is what made it bite, since a routine has to exist *before*
 * an exam runs, long before grading matters.
 *
 * Every action carries the row's own address as `?from=`, snapshotting the
 * live filters and this exam's id, so Back returns here rather than unwinding
 * through Basic Info (§4, §5). Closing an exam does not hide the actions:
 * every destination renders read-only when closed, and CONTEXT.md keeps
 * "aggregate result viewing" available. */
function ExamListRow({
  exam,
  classLabel,
  origin,
  lang,
}: {
  exam: ExamListItem
  classLabel: string | null
  origin: string
  lang: Lang
}) {
  const closed = exam.status === 'closed'
  const complete = examBasicInfoComplete(exam)
  const needsBasicInfo = complete ? undefined : t('exams.completeBasicInfoFirst', lang)
  const needsClass = examHasClass(exam) ? undefined : t('exams.selectClassFirst', lang)
  const examLabel = `${exam.name} (${exam.exam_year})`
  const action = (path: string) => withOrigin(`/school/exams/${exam.id}${path}`, origin)

  return (
    // Anchored so returning from a destination can scroll this row back into
    // view instead of dumping the user at the top of a long list (§5).
    <div id={examRowAnchorId(exam.id)} className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {exam.name} <span className="text-muted">({exam.exam_year})</span>
        </span>
        {classLabel && <span className="text-xs text-muted">{classLabel}</span>}
        {exam.start_date && <span className="text-xs text-muted">{exam.start_date}</span>}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            closed ? 'bg-paper-muted text-muted' : 'bg-mint-soft text-mint-deep'
          }`}
        >
          {closed ? `🔒 ${t('exams.closed', lang)}` : t('exams.open', lang)}
        </span>
      </div>

      <div className="flex flex-col items-end gap-1">
        <span className="flex flex-wrap items-center justify-end gap-2">
          <ExamAction href={action('')} label={t('examSetup.basicInfo', lang)} />
          <ExamAction href={action('/marks-entry')} label={t('exams.markEntry', lang)} reason={needsBasicInfo} />
          <ExamAction href={action('/cocurricular')} label={t('exams.cocurricular', lang)} reason={needsClass} />
          <ExamAction href={action('/seat-plan')} label={t('exams.generateSeatPlan', lang)} reason={needsClass} />
          <ExamAction href={action('/routine')} label={t('exams.makeRoutine', lang)} reason={needsClass} />
          {complete ? (
            <ExamDocumentsModal
              examId={exam.id}
              examLabel={examLabel}
              origin={origin}
              lang={lang}
              triggerClassName={`cursor-pointer ${examActionClass()}`}
            />
          ) : (
            <ExamAction href="" label={t('examDocs.title', lang)} reason={needsBasicInfo} />
          )}
        </span>
        {!complete && <span className="text-xs text-muted">{t('exams.completeBasicInfoFirst', lang)}</span>}
      </div>
    </div>
  )
}
