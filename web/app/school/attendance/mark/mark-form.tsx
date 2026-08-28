'use client'

import { useEffect, useState, useTransition } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { saveStudentAttendance } from '../manual-actions'
import { railClass } from '@/components/ui/page'

interface Row {
  id: string
  full_name: string
  roll_number?: number | null
  present: boolean
  cause: string
}

/** When and by whom this date was last marked (0170), or null if never. */
export interface MarkedBy {
  at: string
  /** Null when the marker's profile is not readable by this caller — a Staff
   *  User may read only their own (0001), so a teacher sees the time and the
   *  Owner sees the name. */
  name: string | null
  isSelf: boolean
}

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

// #540: 44px is the floor for anything a thumb has to hit. h-11 is exactly that.
const toggleBase =
  'inline-flex h-11 flex-1 cursor-pointer items-center justify-center rounded-full border px-4 text-sm font-semibold transition'

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function MarkAttendanceForm({
  lang,
  date,
  students,
  markedBy,
}: {
  lang: Lang
  date: string
  students: Row[]
  markedBy: MarkedBy | null
}) {
  const [rows, setRows] = useState<Row[]>(students)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<MarkedBy | null>(markedBy)
  // #540: an unsaved register is the most expensive thing on this screen — the
  // teacher has walked the room already. Track it, show it, and let the browser
  // ask before the tab closes.
  const [dirty, setDirty] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const setRow = (id: string, patch: Partial<Row>) => {
    setDirty(true)
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const markAll = (present: boolean) => {
    setDirty(true)
    setRows((prev) => prev.map((r) => ({ ...r, present, cause: present ? '' : r.cause })))
  }

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await saveStudentAttendance(
        date,
        rows.map((r) => ({ student_id: r.id, present: r.present, cause: r.cause })),
      )
      if (result.error) {
        setError(result.error)
        return
      }
      setDirty(false)
      setSaved({ at: new Date().toISOString(), name: null, isSelf: true })
    })
  }

  const presentCount = rows.filter((r) => r.present).length

  return (
    <div>
      {/* Never marked, and therefore not "all present". The two states render the
          same roster, so the screen has to say which one it is (#540). */}
      {!saved && (
        <div className="mb-3 rounded-lg border border-sun-deep/30 bg-sun-soft p-3">
          <p className="text-sm font-semibold text-sun-deep">{t('attendance.notTaken', lang)}</p>
          <p className="mt-0.5 text-xs text-sun-deep">{t('attendance.notTakenHelp', lang)}</p>
        </div>
      )}

      {/* Sticky so the bulk actions stay in reach while scrolling a long roster
          on a phone; the shell's header is 56px, hence top-14. */}
      <div className="sticky top-14 z-10 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper/95 p-2 backdrop-blur">
        <div className="text-sm text-muted">
          {presentCount}/{rows.length} {t('attendance.presentShort', lang)}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => markAll(true)}
            className="h-11 cursor-pointer rounded-full border border-line px-4 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('attendance.markAllPresent', lang)}
          </button>
          <button
            type="button"
            onClick={() => markAll(false)}
            className="h-11 cursor-pointer rounded-full border border-line px-4 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('attendance.markAllAbsent', lang)}
          </button>
        </div>
      </div>

      {/* Phone: one card per student, thumb-sized toggle, no horizontal scroll.
          Desktop keeps the register table — a teacher at a desk reads 40 rows
          faster as a grid than as 40 cards. Same state, two renderings. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-line bg-paper p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="font-medium">{r.full_name}</span>
              <span className="text-xs text-muted">
                {t('attendance.rollCol', lang)} {r.roll_number ?? '—'}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={r.present}
                onClick={() => setRow(r.id, { present: true, cause: '' })}
                className={`${toggleBase} ${
                  r.present ? 'border-mint-deep bg-mint-soft text-mint-deep' : 'border-line text-muted'
                }`}
              >
                {t('attendance.presentShort', lang)}
              </button>
              <button
                type="button"
                aria-pressed={!r.present}
                onClick={() => setRow(r.id, { present: false })}
                className={`${toggleBase} ${
                  !r.present ? 'border-alert-deep bg-alert-soft text-alert-deep' : 'border-line text-muted'
                }`}
              >
                {t('attendance.absentShort', lang)}
              </button>
            </div>
            {!r.present && (
              <input
                type="text"
                value={r.cause}
                onChange={(e) => setRow(r.id, { cause: e.target.value })}
                placeholder={t('attendance.causePlaceholder', lang)}
                aria-label={`${t('attendance.causeCol', lang)} — ${r.full_name}`}
                className="mt-2 h-11 w-full rounded-md border border-line bg-paper px-3 text-sm"
              />
            )}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-line bg-paper md:block">
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
                <td className={`${tdClass} ${railClass(r.present ? 'mint' : 'alert')}`}>
                  {r.roll_number ?? <span className="text-muted">—</span>}
                </td>
                <td className={`${tdClass} font-medium`}>{r.full_name}</td>
                <td className={tdClass}>
                  <input
                    type="radio"
                    name={`att-${r.id}`}
                    aria-label={`${t('attendance.presentCol', lang)} — ${r.full_name}`}
                    checked={r.present}
                    onChange={() => setRow(r.id, { present: true, cause: '' })}
                  />
                </td>
                <td className={tdClass}>
                  <input
                    type="radio"
                    name={`att-${r.id}`}
                    aria-label={`${t('attendance.absentCol', lang)} — ${r.full_name}`}
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

      <div className="mt-4 rounded-lg border border-line bg-paper p-4">
        <p className="text-xs text-muted">{t('attendance.rfidNote', lang)}</p>
      </div>

      {/* Sticky bottom bar: on a phone the save button used to sit below the last
          row, which is under the keyboard the moment a cause field has focus. */}
      <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-paper/95 p-2 backdrop-blur">
        <div className="text-sm">
          {error && <span className="text-alert-deep">{error}</span>}
          {!error && dirty && <span className="font-semibold text-sun-deep">{t('attendance.unsaved', lang)}</span>}
          {!error && !dirty && saved && (
            <span className="text-muted">
              {t('attendance.savedAt', lang)} {timeOf(saved.at)}
              {saved.name || saved.isSelf
                ? ` · ${t('attendance.savedBy', lang)} ${saved.name ?? t('attendance.savedByYou', lang)}`
                : ''}
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="h-11 cursor-pointer rounded-full bg-brand-500 px-6 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {t('attendance.saveAttendance', lang)}
        </button>
      </div>
    </div>
  )
}
