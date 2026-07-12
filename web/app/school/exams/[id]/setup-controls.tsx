'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { subjectFullMarks } from '@/lib/exam-setup'
import { t, type Lang } from '@/lib/i18n'
import { CloseExamModal } from '../exam-controls'
import { assignSubjectTeacher, setExamGradingScheme, updateExamBasicInfo } from './actions'

export interface ClassOption {
  id: string
  name: string
  section: string | null
}

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

/** Open/Closed badge + Close Exam button. Closing is permanent (issue #8);
 * the confirmation is CloseExamModal (exam-controls.tsx), a dedicated dialog
 * per exam-close-confirm-modal.html, not a bare window.confirm(). */
export function ExamHeader({
  examId,
  examLabel,
  closed,
  lang,
}: {
  examId: string
  examLabel: string
  closed: boolean
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
        <a
          href={`/school/exams/${examId}/routine`}
          className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('exams.routine', lang)}
        </a>
        <a
          href={`/school/exams/${examId}/seat-plan`}
          className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('exams.seatPlan', lang)}
        </a>
        <a
          href={`/school/exams/${examId}/marks-entry`}
          className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('exams.markEntry', lang)}
        </a>
        <a
          href={`/school/exams/${examId}/promotion`}
          className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('exams.promotion', lang)}
        </a>
        <a
          href={`/school/exams/${examId}/cocurricular`}
          className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('exams.cocurricular', lang)}
        </a>
        <a
          href={`/school/exams/${examId}/printables`}
          className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('exams.printables', lang)}
        </a>
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
  classes: ClassOption[]
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
        <select id="class_id" name="class_id" defaultValue={classId ?? ''} disabled={disabled} className={inputClass}>
          <option value="">{t('exams.allClasses', lang)}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.section ? ` - ${c.section}` : ''}
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
          className={inputClass}
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
        className={inputClass}
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
          className={`${inputClass} h-8`}
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
