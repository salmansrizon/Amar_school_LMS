'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { EMPLOYEE_CATEGORIES } from '@/lib/employees'
import { ACADEMIC_SHIFT_LABEL_KEY, type AcademicShift } from '@/lib/institute'
import { OFFICE_HOUR_DAYS, formatTime12h } from '@/lib/office-hours'
import { dayLabel } from '@/lib/routine'
import { Modal } from '@/components/modal'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { previewOfficeHourSave, saveOfficeHours, type OfficeHourConflict } from './actions'
import { officeHourErrorMessage } from './error-messages'

// Add Office Hour (issue #643): mirrors CopySubjectsAction's Modal shape
// (form -> preview/result -> done, web/app/school/classes/subject-list-table.tsx)
// but the "result" step here is a confirmation to proceed, not a done screen —
// bulk save must never silently overwrite an existing combination (Q3).

function buildFormData(
  shift: string | null,
  categories: ReadonlySet<string>,
  days: ReadonlySet<number>,
  start: string,
  end: string,
): FormData {
  const fd = new FormData()
  if (shift) fd.set('shift', shift)
  for (const c of categories) fd.append('employee_category', c)
  for (const d of days) fd.append('day_of_week', String(d))
  fd.set('start_time', start)
  fd.set('end_time', end)
  return fd
}

function toggleSet<T>(prev: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(prev)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export function OfficeHourForm({
  lang,
  shiftOptions,
  activeShift,
}: {
  lang: Lang
  shiftOptions: readonly AcademicShift[]
  activeShift: string | null
}) {
  const router = useRouter()
  const [shift, setShift] = useState<string | null>(activeShift)
  const [categories, setCategories] = useState<ReadonlySet<string>>(new Set())
  const [days, setDays] = useState<ReadonlySet<number>>(new Set())
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [conflicts, setConflicts] = useState<OfficeHourConflict[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // A soft navigation between Shift tabs (page.tsx re-rendering with a new
  // activeShift) doesn't remount this client component, so useState's initial
  // value alone would go stale. Adjusting state during render (React's own
  // documented pattern for this, "You Might Not Need an Effect") rather than
  // in a useEffect — the render still commits once, and the eslint
  // react-hooks/set-state-in-effect rule this repo enforces forbids the
  // effect-based version.
  const [prevActiveShift, setPrevActiveShift] = useState(activeShift)
  if (activeShift !== prevActiveShift) {
    setPrevActiveShift(activeShift)
    setShift(activeShift)
  }

  const allCategoriesSelected = EMPLOYEE_CATEGORIES.length > 0 && EMPLOYEE_CATEGORIES.every((c) => categories.has(c))
  const allDaysSelected = OFFICE_HOUR_DAYS.every((d) => days.has(d))

  const reset = () => {
    setCategories(new Set())
    setDays(new Set())
    setStart('')
    setEnd('')
    setConflicts(null)
    setError(null)
    setShift(activeShift)
  }

  const runSave = (close: () => void) => {
    const fd = buildFormData(shift, categories, days, start, end)
    startTransition(async () => {
      const res = await saveOfficeHours(fd)
      if (res.error) {
        setError(res.error)
        return
      }
      // close() fires Modal's onOpenChange(false), which already resets —
      // no need to call reset() here too.
      close()
      router.refresh()
    })
  }

  const handlePreview = (close: () => void) => {
    setError(null)
    const fd = buildFormData(shift, categories, days, start, end)
    startTransition(async () => {
      const res = await previewOfficeHourSave(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      if (res.conflicts.length) setConflicts(res.conflicts)
      else runSave(close)
    })
  }

  return (
    <Modal
      lang={lang}
      triggerLabel={t('officeHour.addButton', lang)}
      triggerClassName="inline-flex min-h-9 cursor-pointer items-center rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600"
      title={t('officeHour.addButton', lang)}
      onOpenChange={(open) => {
        // Dismissing via backdrop/X skips runSave()'s own reset() — without
        // this, stale checkbox/time selections from an abandoned Add would
        // resurface (and get submitted) the next time the modal opens.
        if (!open) reset()
      }}
    >
      {(close) =>
        conflicts ? (
          <div className="grid gap-3">
            <p className="text-sm font-semibold text-alert-deep">{t('officeHour.conflictTitle', lang)}</p>
            <p className="text-sm text-muted">{t('officeHour.conflictIntro', lang)}</p>
            <ul className="grid gap-1 rounded-md border border-line bg-paper-muted p-3 text-sm">
              {conflicts.map((c) => (
                <li key={`${c.employee_category}-${c.day_of_week}`}>
                  {c.employee_category} · {dayLabel(c.day_of_week, lang)}: {formatTime12h(c.start_time)} –{' '}
                  {formatTime12h(c.end_time)} → {formatTime12h(start)} – {formatTime12h(end)}
                </li>
              ))}
            </ul>
            {error && <p className="text-sm text-alert-deep">{officeHourErrorMessage(error, lang)}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => runSave(close)}
                className={`${primaryBtnClass} flex-1`}
              >
                {t('officeHour.conflictConfirm', lang)}
              </button>
              <button
                type="button"
                onClick={() => setConflicts(null)}
                className="cursor-pointer rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-paper-muted"
              >
                {t('officeHour.conflictCancel', lang)}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {shiftOptions.length > 0 && (
              <div>
                <p className={labelClass}>{t('officeHour.shift', lang)}</p>
                <div className="flex flex-wrap gap-3">
                  {shiftOptions.map((s) => (
                    <label key={s} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="radio"
                        name="office-hour-shift"
                        checked={shift === s}
                        onChange={() => setShift(s)}
                      />
                      {t(ACADEMIC_SHIFT_LABEL_KEY[s], lang)}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className={labelClass}>{t('officeHour.categories', lang)}</p>
              <label className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={allCategoriesSelected}
                  onChange={() => setCategories(allCategoriesSelected ? new Set() : new Set(EMPLOYEE_CATEGORIES))}
                />
                {t('classes.selectAll', lang)}
              </label>
              <div className="grid max-h-40 gap-1 overflow-y-auto border-t border-line pt-2 sm:grid-cols-2">
                {EMPLOYEE_CATEGORIES.map((c) => (
                  <label key={c} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={categories.has(c)}
                      onChange={() => setCategories((prev) => toggleSet(prev, c))}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className={labelClass}>{t('officeHour.days', lang)}</p>
              <label className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={allDaysSelected}
                  onChange={() => setDays(allDaysSelected ? new Set() : new Set(OFFICE_HOUR_DAYS))}
                />
                {t('classes.selectAll', lang)}
              </label>
              <div className="flex flex-wrap gap-3 border-t border-line pt-2">
                {OFFICE_HOUR_DAYS.map((d) => (
                  <label key={d} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={days.has(d)} onChange={() => setDays((prev) => toggleSet(prev, d))} />
                    {dayLabel(d, lang)}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="oh-start">
                  {t('officeHour.startTime', lang)}
                </label>
                <input
                  id="oh-start"
                  type="time"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="oh-end">
                  {t('officeHour.endTime', lang)}
                </label>
                <input
                  id="oh-end"
                  type="time"
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {error && <p className="text-sm text-alert-deep">{officeHourErrorMessage(error, lang)}</p>}

            <button type="button" disabled={pending} onClick={() => handlePreview(close)} className={primaryBtnClass}>
              {t('officeHour.save', lang)}
            </button>
          </div>
        )
      }
    </Modal>
  )
}
