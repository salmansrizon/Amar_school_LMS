'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { examBasicInfoComplete, examHasClass, filterExams } from '@/lib/exam-setup'
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
              <ExamListRow exam={exam} classLabel={classLabelOf(classById.get(exam.class_id ?? ''))} lang={lang} />
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

/** Map #366: every exam row offers the same four actions — Basic Info, Mark
 * Entry, Co-Curricular, Documents. Promotion and Close Exam moved inside Basic
 * Info; Seat Plan is now one of the Documents. Marks entry and the documents
 * need a class *and* a grading scheme (docs/010_exam_system.md); co-curricular
 * only needs the class, matching what its own page already requires — so the
 * two carry different explanations when gated. Closing an exam no longer hides
 * the actions: every destination renders read-only when closed, and CONTEXT.md
 * keeps "aggregate result viewing" available. */
function ExamListRow({ exam, classLabel, lang }: { exam: ExamListItem; classLabel: string | null; lang: Lang }) {
  const closed = exam.status === 'closed'
  const complete = examBasicInfoComplete(exam)
  const needsBasicInfo = complete ? undefined : t('exams.completeBasicInfoFirst', lang)
  const needsClass = examHasClass(exam) ? undefined : t('exams.selectClassFirst', lang)
  const examLabel = `${exam.name} (${exam.exam_year})`

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
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
          <ExamAction href={`/school/exams/${exam.id}`} label={t('examSetup.basicInfo', lang)} />
          <ExamAction
            href={`/school/exams/${exam.id}/marks-entry`}
            label={t('exams.markEntry', lang)}
            reason={needsBasicInfo}
          />
          <ExamAction
            href={`/school/exams/${exam.id}/cocurricular`}
            label={t('exams.cocurricular', lang)}
            reason={needsClass}
          />
          {complete ? (
            <ExamDocumentsModal
              examId={exam.id}
              examLabel={examLabel}
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
