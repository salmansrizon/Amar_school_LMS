'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { filterExams } from '@/lib/exam-setup'
import { t, type Lang } from '@/lib/i18n'
import { addExam } from './actions'

// Exams II (issue #47) repurposes this file for the exams-list.html toolbar +
// row (search/class/status filter, Setup/Seat Plan/locked-Closed actions) —
// per-exam rename/close now live on the Exam Setup detail page
// ([id]/setup-controls.tsx), so the old inline ExamRow is replaced.

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
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className={`${inputClass} max-w-48`}>
          <option value="">{t('exams.allClasses', lang)}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.section ? ` - ${c.section}` : ''}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} max-w-40`}>
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

function ExamListRow({ exam, classLabel, lang }: { exam: ExamListItem; classLabel: string | null; lang: Lang }) {
  const closed = exam.status === 'closed'
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
      <span className="flex items-center gap-2">
        {closed ? (
          <span className="text-xs text-muted" title={t('exams.lockedEdit', lang)}>
            {t('exams.setup', lang)} · {t('exams.seatPlan', lang)}
          </span>
        ) : (
          <>
            <Link
              href={`/school/exams/${exam.id}`}
              className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
            >
              {t('exams.setup', lang)}
            </Link>
            <Link
              href={`/school/exams/${exam.id}/seat-plan`}
              className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
            >
              {t('exams.seatPlan', lang)}
            </Link>
          </>
        )}
      </span>
    </div>
  )
}
