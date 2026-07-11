'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { inputClass, primaryBtnClass } from '@/components/auth-card'
import { subjectFullMarks } from '@/lib/exam-setup'
import { evaluateSubject, type GradingScheme } from '@/lib/grading'
import { t, type Lang } from '@/lib/i18n'
import { saveMarks } from './actions'

export interface SubjectOption {
  id: string
  name: string
  theory_marks: number
  mcq_marks: number
  practical_marks: number
}

/** Per marks-entry.html's subject dropdown — switching subjects navigates
 * (?subject=id) so the table below always reflects one subject's marks at a
 * time, the same "finish one subject, pick the next" flow the mockup's hint
 * text describes. */
export function SubjectPicker({
  subjects,
  selectedId,
  lang,
}: {
  subjects: SubjectOption[]
  selectedId: string
  lang: Lang
}) {
  const router = useRouter()
  const pathname = usePathname()
  return (
    <select
      value={selectedId}
      aria-label={t('markEntry.pickSubject', lang)}
      onChange={(e) => router.push(`${pathname}?subject=${e.target.value}`)}
      className={`${inputClass} max-w-56`}
    >
      {subjects.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  )
}

export interface MarkStudentRow {
  id: string
  roll_number: number | null
  full_name: string
  theory: number
  mcq: number
  practical: number
  isOptional: boolean
}

interface RowMarks {
  theory: number
  mcq: number
  practical: number
}

function GradeBadge({ label, passed }: { label: string | null; passed: boolean }) {
  if (!label) return <span className="text-muted">—</span>
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        passed ? 'bg-mint-soft text-mint-deep' : 'bg-alert-soft text-alert-deep'
      }`}
    >
      {label}
    </span>
  )
}

export function MarksEntryTable({
  examId,
  subject,
  rows,
  scheme,
  disabled,
  lang,
}: {
  examId: string
  subject: SubjectOption
  rows: MarkStudentRow[]
  scheme: GradingScheme | null
  disabled: boolean
  lang: Lang
}) {
  const router = useRouter()
  const [marks, setMarks] = useState<Map<string, RowMarks>>(
    () => new Map(rows.map((r) => [r.id, { theory: r.theory, mcq: r.mcq, practical: r.practical }])),
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fullMarks = subjectFullMarks(subject)

  function update(studentId: string, field: keyof RowMarks, value: number, max: number) {
    const clamped = Number.isFinite(value) ? Math.max(0, Math.min(value, max)) : 0
    setMarks((prev) => {
      const next = new Map(prev)
      const cur = next.get(studentId) ?? { theory: 0, mcq: 0, practical: 0 }
      next.set(studentId, { ...cur, [field]: clamped })
      return next
    })
  }

  function componentInput(row: MarkStudentRow, field: keyof RowMarks, max: number) {
    const value = marks.get(row.id)?.[field] ?? 0
    if (max <= 0) return <span className="text-muted">—</span>
    return (
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        disabled={disabled}
        aria-label={`${row.full_name} ${field}`}
        onChange={(e) => update(row.id, field, Number(e.target.value), max)}
        className="h-7 w-16 rounded-md border border-line-strong bg-paper px-2 text-center text-sm"
      />
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-160 text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold text-muted">
              <th className="py-2 pr-2">{t('students.roll', lang)}</th>
              <th className="py-2 pr-2">{t('students.name', lang)}</th>
              <th className="py-2 pr-2 text-right">
                {t('examSetup.theory', lang)} ({subject.theory_marks})
              </th>
              <th className="py-2 pr-2 text-right">
                {t('examSetup.mcq', lang)} ({subject.mcq_marks})
              </th>
              <th className="py-2 pr-2 text-right">
                {t('examSetup.practical', lang)} ({subject.practical_marks})
              </th>
              <th className="py-2 pr-2 text-right">{t('markEntry.total', lang)}</th>
              <th className="py-2 text-right">{t('markEntry.grade', lang)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const m = marks.get(row.id) ?? { theory: 0, mcq: 0, practical: 0 }
              const total = m.theory + m.mcq + m.practical
              const evaluated = scheme
                ? evaluateSubject(
                    { subjectId: subject.id, fullMarks, obtainedMarks: total, isOptional: row.isOptional },
                    scheme,
                  )
                : null
              return (
                <tr key={row.id}>
                  <td className="py-2 pr-2">{row.roll_number ?? '—'}</td>
                  <td className="py-2 pr-2 font-medium">{row.full_name}</td>
                  <td className="py-2 pr-2 text-right">{componentInput(row, 'theory', subject.theory_marks)}</td>
                  <td className="py-2 pr-2 text-right">{componentInput(row, 'mcq', subject.mcq_marks)}</td>
                  <td className="py-2 pr-2 text-right">{componentInput(row, 'practical', subject.practical_marks)}</td>
                  <td className="py-2 pr-2 text-right font-semibold">{total}</td>
                  <td className="py-2 text-right">
                    <GradeBadge label={evaluated?.label ?? null} passed={evaluated?.passed ?? false} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-2 text-sm text-alert-deep">{error}</p>}
      {!disabled && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">{t('markEntry.hint', lang)}</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                setError(null)
                const payload = rows.map((row) => {
                  const m = marks.get(row.id) ?? { theory: 0, mcq: 0, practical: 0 }
                  return { studentId: row.id, theory: m.theory, mcq: m.mcq, practical: m.practical }
                })
                const result = await saveMarks(examId, subject.id, payload)
                if (result.error) setError(result.error)
                else router.refresh()
              })
            }}
            className={primaryBtnClass}
          >
            {t('markEntry.save', lang)}
          </button>
        </div>
      )}
    </>
  )
}
