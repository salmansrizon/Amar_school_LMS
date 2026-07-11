'use client'

import { useState, useTransition } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { saveStudentAttendance } from '../manual-actions'

interface Row {
  id: string
  full_name: string
  roll_number?: number | null
  present: boolean
  cause: string
}

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export function MarkAttendanceForm({ lang, date, students }: { lang: Lang; date: string; students: Row[] }) {
  const [rows, setRows] = useState<Row[]>(students)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const setRow = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const markAll = (present: boolean) =>
    setRows((prev) => prev.map((r) => ({ ...r, present, cause: present ? '' : r.cause })))

  const save = () => {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await saveStudentAttendance(
        date,
        rows.map((r) => ({ student_id: r.id, present: r.present, cause: r.cause })),
      )
      if (result.error) setError(result.error)
      else setSaved(true)
    })
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted">
          {rows.length} {t('attendance.studentsTotal', lang)}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => markAll(true)}
            className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('attendance.markAllPresent', lang)}
          </button>
          <button
            type="button"
            onClick={() => markAll(false)}
            className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('attendance.markAllAbsent', lang)}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-paper shadow-card">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line-strong">
              <th className={thClass}>{t('attendance.rollCol', lang)}</th>
              <th className={thClass}>{t('employees.name', lang)}</th>
              <th className={thClass}>{t('attendance.presentCol', lang)}</th>
              <th className={thClass}>{t('attendance.absentCol', lang)}</th>
              <th className={thClass}>{t('attendance.causeCol', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line">
                <td className={tdClass}>{r.roll_number ?? <span className="text-muted">—</span>}</td>
                <td className={`${tdClass} font-medium`}>{r.full_name}</td>
                <td className={tdClass}>
                  <input
                    type="radio"
                    name={`att-${r.id}`}
                    checked={r.present}
                    onChange={() => setRow(r.id, { present: true, cause: '' })}
                  />
                </td>
                <td className={tdClass}>
                  <input
                    type="radio"
                    name={`att-${r.id}`}
                    checked={!r.present}
                    onChange={() => setRow(r.id, { present: false })}
                  />
                </td>
                <td className={tdClass}>
                  <input
                    type="text"
                    disabled={r.present}
                    value={r.cause}
                    onChange={(e) => setRow(r.id, { cause: e.target.value })}
                    placeholder="—"
                    className="w-full rounded-md border border-line bg-paper px-2 py-1 text-sm disabled:bg-paper-muted disabled:text-muted"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-paper p-4 shadow-card">
        <p className="text-xs text-muted">{t('attendance.rfidNote', lang)}</p>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm">
          {error && <span className="text-alert-deep">{error}</span>}
          {saved && !error && <span className="text-mint-deep">{t('attendance.saved', lang)}</span>}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="cursor-pointer rounded-full bg-brand-500 px-5 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {t('attendance.saveAttendance', lang)}
        </button>
      </div>
    </div>
  )
}
