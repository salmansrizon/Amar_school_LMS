'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { primaryBtnClass } from '@/components/auth-card'
import { markCellError, markRowState, subjectFullMarks, type MarkCellError, type MarkCells } from '@/lib/exam-setup'
import { evaluateSubject, type GradingScheme } from '@/lib/grading'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { toLatinDigits } from '@/lib/bd-mobile'
import { saveMarks } from './actions'
import { ComboboxField } from '@/components/ui/combobox-field'

export interface SubjectOption {
  id: string
  name: string
  theory_marks: number
  mcq_marks: number
  practical_marks: number
}

// True while the grid below holds typed marks that are not saved. Module
// state rather than a context: the picker and the grid are siblings rendered
// by a server page, and all the picker needs is this one yes/no.
let unsavedMarks = false

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
    <ComboboxField
      value={selectedId}
      aria-label={t('markEntry.pickSubject', lang)}
      // replace, not push: in the row-action popup, ✕ (router.back) must return
      // to the list, not to the previously picked subject.
      onValueChange={(v) => {
        // Switching subject reloads the grid, which used to drop typed marks
        // without a word (audit AC10).
        if (v !== selectedId && unsavedMarks && !window.confirm(t('markEntry.unsavedConfirm', lang))) return
        router.replace(`${pathname}?subject=${v}`)
      }}
      className="max-w-56"
      options={subjects.map((s) => ({ value: s.id, label: s.name }))}
    />
  )
}

/** One roster student and the marks already saved for them, as the text each
 * cell starts with — '' when nothing is saved (see MarkCells). */
export interface MarkStudentRow extends MarkCells {
  id: string
  roll_number: number | null
  full_name: string
  isOptional: boolean
}

const CELL_ERROR: Record<MarkCellError, MessageKey> = {
  overMax: 'markEntry.errOverMax',
  negative: 'markEntry.errNegative',
  invalid: 'markEntry.errInvalid',
}

const COMPONENTS = ['theory', 'mcq', 'practical'] as const
type Component = (typeof COMPONENTS)[number]

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

const sameCells = (a: MarkCells, b: MarkCells) => COMPONENTS.every((c) => a[c].trim() === b[c].trim())

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
  const initial = () =>
    new Map<string, MarkCells>(rows.map((r) => [r.id, { theory: r.theory, mcq: r.mcq, practical: r.practical }]))
  // `saved` is what the database holds, `marks` what the grid shows; a row is
  // dirty while the two differ.
  const [saved, setSaved] = useState(initial)
  const [marks, setMarks] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  // A half-filled row is only called out once Save was tried — while typing
  // across a row it is half-filled for a moment by nature.
  const [attempted, setAttempted] = useState(false)
  const [pending, startTransition] = useTransition()
  const fullMarks = subjectFullMarks(subject)
  const max: Record<Component, number> = {
    theory: subject.theory_marks,
    mcq: subject.mcq_marks,
    practical: subject.practical_marks,
  }
  const blank: MarkCells = { theory: '', mcq: '', practical: '' }

  const dirtyRows = rows.filter((r) => !sameCells(marks.get(r.id) ?? blank, saved.get(r.id) ?? blank))
  const dirty = dirtyRows.length > 0

  useEffect(() => {
    unsavedMarks = dirty
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    // In-app links (sidebar, breadcrumbs, Back) do not fire beforeunload.
    // Capture phase, so a declined prompt stops the click before the router
    // sees it.
    const onLinkClick = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest('a[href]') : null
      if (!link || link.getAttribute('target') === '_blank') return
      if (!window.confirm(t('markEntry.unsavedConfirm', lang))) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', onUnload)
    document.addEventListener('click', onLinkClick, true)
    return () => {
      unsavedMarks = false
      window.removeEventListener('beforeunload', onUnload)
      document.removeEventListener('click', onLinkClick, true)
    }
  }, [dirty, lang])

  function update(studentId: string, field: Component, value: string) {
    setMarks((prev) => {
      const next = new Map(prev)
      next.set(studentId, { ...(next.get(studentId) ?? blank), [field]: toLatinDigits(value) })
      return next
    })
  }

  function componentInput(row: MarkStudentRow, field: Component) {
    if (max[field] <= 0) return <span className="text-muted">—</span>
    const value = marks.get(row.id)?.[field] ?? ''
    const cellError = markCellError(value, max[field])
    const errorId = `${row.id}-${field}-error`
    return (
      <>
        <input
          // Text, not number: a number input refuses the Bangla digits a Bangla
          // keyboard types. update() turns them into Latin; markCellError rules.
          type="text"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          aria-label={`${row.full_name} ${field}`}
          aria-invalid={cellError ? true : undefined}
          aria-describedby={cellError ? errorId : undefined}
          onChange={(e) => update(row.id, field, e.target.value)}
          className={`h-7 w-16 rounded-md border bg-paper px-2 text-center text-sm ${
            cellError ? 'border-alert text-alert-deep' : 'border-line-strong'
          }`}
        />
        {cellError && (
          <span id={errorId} role="alert" className="mt-1 block text-xs text-alert-deep">
            {t(CELL_ERROR[cellError], lang)}
          </span>
        )}
      </>
    )
  }

  function save() {
    setAttempted(true)
    const invalid = rows.some((row) => {
      const m = marks.get(row.id) ?? blank
      return markRowState(m, subject) === 'partial' || COMPONENTS.some((c) => max[c] > 0 && markCellError(m[c], max[c]))
    })
    if (invalid) {
      setError(t('markEntry.fixErrors', lang))
      return
    }
    setError(null)
    const snapshot = marks
    startTransition(async () => {
      // Only the rows that changed: an untouched student is neither rewritten
      // nor — if blank — deleted.
      const payload = dirtyRows.map((row) => ({ studentId: row.id, ...(snapshot.get(row.id) ?? blank) }))
      const result = await saveMarks(examId, subject.id, payload)
      if (result.invalid) setError(t('markEntry.fixErrors', lang))
      else if (result.error) setError(result.error)
      else {
        setSaved(snapshot)
        setAttempted(false)
        toast.success(t('markEntry.saved', lang))
        router.refresh()
      }
    })
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-160 text-sm">
          <thead className="bg-paper-muted">
            <tr className="text-left text-sm text-muted">
              <th className="px-4 py-3">{t('students.roll', lang)}</th>
              <th className="px-4 py-3">{t('students.name', lang)}</th>
              <th className="px-4 py-3 text-right">
                {t('examSetup.theory', lang)} ({subject.theory_marks})
              </th>
              <th className="px-4 py-3 text-right">
                {t('examSetup.mcq', lang)} ({subject.mcq_marks})
              </th>
              <th className="px-4 py-3 text-right">
                {t('examSetup.practical', lang)} ({subject.practical_marks})
              </th>
              <th className="px-4 py-3 text-right">{t('markEntry.total', lang)}</th>
              <th className="px-4 py-3 text-right">{t('markEntry.grade', lang)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const m = marks.get(row.id) ?? blank
              const state = markRowState(m, subject)
              const valid = state === 'complete' && COMPONENTS.every((c) => max[c] <= 0 || !markCellError(m[c], max[c]))
              // A total and a grade exist only for a fully entered, valid row —
              // a blank row has no mark, which is not a mark of 0.
              const total = valid ? COMPONENTS.reduce((sum, c) => sum + (max[c] > 0 ? Number(m[c]) : 0), 0) : null
              const evaluated =
                scheme && total !== null
                  ? evaluateSubject(
                      { subjectId: subject.id, fullMarks, obtainedMarks: total, isOptional: row.isOptional },
                      scheme,
                    )
                  : null
              return (
                <tr key={row.id}>
                  <td className="px-4 py-3">{row.roll_number ?? '—'}</td>
                  <td className="px-4 py-3 font-medium">
                    {row.full_name}
                    {attempted && state === 'partial' && (
                      <span role="alert" className="mt-1 block text-xs font-normal text-alert-deep">
                        {t('markEntry.errPartial', lang)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{componentInput(row, 'theory')}</td>
                  <td className="px-4 py-3 text-right">{componentInput(row, 'mcq')}</td>
                  <td className="px-4 py-3 text-right">{componentInput(row, 'practical')}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {total ?? <span className="font-normal text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <GradeBadge label={evaluated?.label ?? null} passed={evaluated?.passed ?? false} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-alert-deep">
          {error}
        </p>
      )}
      {!disabled && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            {t('markEntry.blankHint', lang)} {t('markEntry.hint', lang)}
          </p>
          <div className="flex items-center gap-3">
            {dirty && <span className="text-xs font-semibold text-sun-deep">{t('markEntry.unsaved', lang)}</span>}
            {/* Nothing typed, nothing to save — and no toast claiming a save. */}
            <button type="button" disabled={pending || !dirty} onClick={save} className={primaryBtnClass}>
              {t('markEntry.save', lang)}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
