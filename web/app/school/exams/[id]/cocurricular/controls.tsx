'use client'

import { useState, useTransition } from 'react'
import { primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { saveCocurricularMarks, type CocurricularMarkRow } from './actions'

export interface ChecklistItemOption {
  id: string
  label: string
}

export interface ChecklistStudentRow {
  id: string
  roll_number: number | null
  full_name: string
  checkedItemIds: string[]
}

/** Roster x items checkbox grid (mockup has no equivalent screen — this is
 * the entry UI the checklist itself needs, mirroring marks-entry's one-Save-
 * covers-the-table pattern rather than per-cell round trips). */
export function CocurricularEntryTable({
  examId,
  items,
  rows,
  disabled,
  lang,
}: {
  examId: string
  items: ChecklistItemOption[]
  rows: ChecklistStudentRow[]
  disabled: boolean
  lang: Lang
}) {
  const [checkedByStudent, setCheckedByStudent] = useState<Map<string, Set<string>>>(
    () => new Map(rows.map((r) => [r.id, new Set(r.checkedItemIds)])),
  )
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const toggle = (studentId: string, itemId: string) => {
    setSaved(false)
    setCheckedByStudent((prev) => {
      const next = new Map(prev)
      const set = new Set(next.get(studentId) ?? [])
      if (set.has(itemId)) set.delete(itemId)
      else set.add(itemId)
      next.set(studentId, set)
      return next
    })
  }

  const onSave = () => {
    const payload: CocurricularMarkRow[] = []
    for (const row of rows) {
      const set = checkedByStudent.get(row.id) ?? new Set<string>()
      for (const item of items) {
        payload.push({ studentId: row.id, itemId: item.id, checked: set.has(item.id) })
      }
    }
    startTransition(async () => {
      setError(null)
      const result = await saveCocurricularMarks(examId, payload)
      if (result.error) setError(result.error)
      else setSaved(true)
    })
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-2 font-semibold">{t('students.roll', lang)}</th>
              <th className="py-2 pr-2 font-semibold">{t('students.name', lang)}</th>
              {items.map((item) => (
                <th key={item.id} className="py-2 pr-2 text-center font-semibold">
                  {item.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line">
                <td className="py-2 pr-2">{row.roll_number ?? '—'}</td>
                <td className="py-2 pr-2">{row.full_name}</td>
                {items.map((item) => (
                  <td key={item.id} className="py-2 pr-2 text-center">
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={(checkedByStudent.get(row.id) ?? new Set()).has(item.id)}
                      onChange={() => toggle(row.id, item.id)}
                      className="size-4"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <div className="mt-4 flex items-center gap-3">
          <button type="button" disabled={pending} onClick={onSave} className={primaryBtnClass}>
            {t('cocurricular.save', lang)}
          </button>
          {saved && <span className="text-xs text-mint-deep">{t('cocurricular.saved', lang)}</span>}
          {error && <span className="text-xs text-alert-deep">{error}</span>}
        </div>
      )}
    </div>
  )
}
