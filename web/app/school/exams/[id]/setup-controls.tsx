'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { subjectFullMarks } from '@/lib/exam-setup'
import { t, type Lang } from '@/lib/i18n'
import { CloseExamModal } from '../exam-controls'
import { ExamAction, examActionClass } from '../exam-action'
import { ExamDocumentsModal } from '../exam-documents-modal'
import { withOrigin } from '@/lib/back-nav'
import { assignSubjectTeacher, setExamGradingScheme, updateExamBasicInfo } from './actions'
import { deleteExam } from '../actions'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { dateInputClass, selectClass } from '@/components/ui/field'
import { classCatalogueLabel, type ClassCatalogueRow } from '@/lib/class-catalogue'

export interface SchemeOption {
  id: string
  name: string
}

export interface TeacherOption {
  id: string
  full_name: string
}

export interface SubjectRow {
  id: string
  name: string
  theory_marks: number
  mcq_marks: number
  practical_marks: number
  teacher_id: string | null
}

/** Open/Closed badge + the only actions Basic Info still carries: Promotion,
 * Documents and Close Exam. Map #366 stripped the other seven shortcuts that
 * had accumulated here — routine, seat plan, marks entry, co-curricular,
 * printables, admit cards, result book, print-all all live in the Documents
 * modal or on the exam row now. Documents is gated exactly like the row's:
 * a class and a grading scheme must be set. Closing is permanent (issue #8);
 * the confirmation is CloseExamModal (exam-controls.tsx), a dedicated dialog
 * per exam-close-confirm-modal.html, not a bare window.confirm(). */
/** Delete an open exam, and leave the page it was on. Everything the exam owns
 *  goes with it — routine, seat plan, marks, co-curricular marks — which is
 *  what the body says before the operator confirms. */
function DeleteExamButton({ examId, examLabel, lang }: { examId: string; examLabel: string; lang: Lang }) {
  const router = useRouter()
  return (
    <ConfirmDialog
      triggerLabel={t('exams.delete', lang)}
      triggerClassName={`cursor-pointer ${examActionClass('header')} border-alert text-alert-deep`}
      title={t('exams.deleteTitle', lang)}
      body={`${examLabel} — ${t('exams.deleteBody', lang)}`}
      confirmLabel={t('exams.deleteConfirm', lang)}
      cancelLabel={t('exams.closeModalCancel', lang)}
      onConfirm={async () => {
        const result = await deleteExam(examId)
        if (result.error === 'closed') return { error: t('exams.deleteClosed', lang) }
        if (result.error === 'not-found') return { error: t('exams.deleteMissing', lang) }
        if (result.error) return result
        // The page this button is on no longer exists.
        router.push('/school/exams')
      }}
    />
  )
}

export function ExamHeader({
  examId,
  examLabel,
  closed,
  basicInfoComplete,
  /** Basic Info's own address, origin included — so a document opened from
   *  here returns to Basic Info, and Basic Info's own Back still returns to
   *  the exam row that opened it (map #373). */
  selfHref,
  lang,
}: {
  examId: string
  examLabel: string
  closed: boolean
  basicInfoComplete: boolean
  selfHref: string
  lang: Lang
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          closed ? 'bg-paper-muted text-muted' : 'bg-mint-soft text-mint-deep'
        }`}
      >
        {closed ? `🔒 ${t('exams.closed', lang)}` : t('exams.open', lang)}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <ExamAction
          href={withOrigin(`/school/exams/${examId}/promotion`, selfHref)}
          label={t('exams.promotion', lang)}
          size="header"
        />
        {basicInfoComplete ? (
          <ExamDocumentsModal
            examId={examId}
            examLabel={examLabel}
            origin={selfHref}
            lang={lang}
            triggerClassName={`cursor-pointer ${examActionClass('header')}`}
          />
        ) : (
          <ExamAction
            href=""
            label={t('examDocs.title', lang)}
            reason={t('exams.completeBasicInfoFirst', lang)}
            size="header"
          />
        )}
        {/* #551: an exam created by mistake used to be permanent for every school
            role — there was no delete anywhere in the product. Only while open:
            a Closed exam keeps its results and the 0037 trigger refuses to drop
            it, so the control is hidden rather than offered and then denied. */}
        {!closed && <DeleteExamButton examId={examId} examLabel={examLabel} lang={lang} />}
        {!closed && (
          <CloseExamModal
            examId={examId}
            examLabel={examLabel}
            lang={lang}
            triggerClassName="cursor-pointer rounded-full bg-alert-soft px-3 py-1.5 text-xs font-semibold text-alert-deep hover:bg-alert/20"
          />
        )}
      </div>
    </div>
  )
}

export function BasicInfoForm({
  examId,
  name,
  examYear,
  classId,
  startDate,
  classes,
  disabled,
  lang,
}: {
  examId: string
  name: string
  examYear: number
  classId: string | null
  startDate: string | null
  classes: ClassCatalogueRow[]
  disabled: boolean
  lang: Lang
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(async () => {
          setError(null)
          const result = await updateExamBasicInfo(examId, data)
          if (result.error) setError(result.error)
          else router.refresh()
        })
      }}
    >
      <div>
        <label className={labelClass} htmlFor="name">{t('exams.name', lang)}</label>
        <input id="name" name="name" defaultValue={name} disabled={disabled} required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="class_id">{t('exams.class', lang)}</label>
        <select id="class_id" name="class_id" defaultValue={classId ?? ''} disabled={disabled} className={selectClass({ size: 'md', fullWidth: true })}>
          <option value="">{t('exams.allClasses', lang)}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {classCatalogueLabel(c)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="exam_year">{t('exams.year', lang)}</label>
        <input
          id="exam_year"
          name="exam_year"
          type="number"
          min={2000}
          max={2100}
          defaultValue={examYear}
          disabled={disabled}
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="start_date">{t('exams.startDate', lang)}</label>
        <input
          id="start_date"
          name="start_date"
          type="date"
          defaultValue={startDate ?? ''}
          disabled={disabled}
          className={dateInputClass({ size: 'md', fullWidth: true })}
        />
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-2">{error}</p>}
      {!disabled && (
        <button type="submit" disabled={pending} className={`${primaryBtnClass} sm:col-span-2`}>
          {t('examSetup.save', lang)}
        </button>
      )}
    </form>
  )
}

export function GradingSchemeSelect({
  examId,
  schemeId,
  schemes,
  disabled,
  lang,
}: {
  examId: string
  schemeId: string | null
  schemes: SchemeOption[]
  disabled: boolean
  lang: Lang
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="max-w-sm">
      <label className={labelClass} htmlFor="grading_scheme_id">{t('examSetup.pickGradingScheme', lang)}</label>
      <select
        id="grading_scheme_id"
        defaultValue={schemeId ?? ''}
        disabled={disabled || pending}
        className={selectClass({ size: 'md', fullWidth: true })}
        onChange={(e) => {
          const value = e.target.value || null
          startTransition(async () => {
            setError(null)
            const result = await setExamGradingScheme(examId, value)
            if (result.error) setError(result.error)
            else router.refresh()
          })
        }}
      >
        <option value="">{t('examSetup.noScheme', lang)}</option>
        {schemes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
    </div>
  )
}

export function SubjectTeacherTable({
  examId,
  subjects,
  teachers,
  disabled,
  lang,
}: {
  examId: string
  subjects: SubjectRow[]
  teachers: TeacherOption[]
  disabled: boolean
  lang: Lang
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-140 text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold text-muted">
            <th className="py-2 pr-2">{t('examSetup.subject', lang)}</th>
            <th className="py-2 pr-2">{t('examSetup.assignedTeacher', lang)}</th>
            <th className="py-2 pr-2 text-right">{t('examSetup.theory', lang)}</th>
            <th className="py-2 pr-2 text-right">{t('examSetup.mcq', lang)}</th>
            <th className="py-2 pr-2 text-right">{t('examSetup.practical', lang)}</th>
            <th className="py-2 text-right">{t('examSetup.fullMarks', lang)}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {subjects.map((s) => (
            <SubjectTeacherRow key={s.id} examId={examId} subject={s} teachers={teachers} disabled={disabled} lang={lang} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SubjectTeacherRow({
  examId,
  subject,
  teachers,
  disabled,
  lang,
}: {
  examId: string
  subject: SubjectRow
  teachers: TeacherOption[]
  disabled: boolean
  lang: Lang
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <tr>
      <td className="py-2 pr-2 font-medium">{subject.name}</td>
      <td className="py-2 pr-2">
        <select
          defaultValue={subject.teacher_id ?? ''}
          disabled={disabled || pending}
          aria-label={t('examSetup.assignedTeacher', lang)}
          className={selectClass({ size: 'xs', fullWidth: true })}
          onChange={(e) => {
            const teacherId = e.target.value || null
            startTransition(async () => {
              setError(null)
              const result = await assignSubjectTeacher(examId, subject.id, teacherId)
              if (result.error) setError(result.error)
              else router.refresh()
            })
          }}
        >
          <option value="">{t('examSetup.pickTeacher', lang)}</option>
          {teachers.map((t2) => (
            <option key={t2.id} value={t2.id}>
              {t2.full_name}
            </option>
          ))}
        </select>
        {error && <p className="mt-1 text-xs text-alert-deep">{error}</p>}
      </td>
      <td className="py-2 pr-2 text-right">{subject.theory_marks || '—'}</td>
      <td className="py-2 pr-2 text-right">{subject.mcq_marks || '—'}</td>
      <td className="py-2 pr-2 text-right">{subject.practical_marks || '—'}</td>
      <td className="py-2 text-right font-semibold">{subjectFullMarks(subject)}</td>
    </tr>
  )
}
