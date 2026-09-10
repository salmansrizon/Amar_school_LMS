'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/school-icons'
import { t, type Lang } from '@/lib/i18n'
import {
  shiftSelectionCookieAssignment,
  academicYearSelectionCookieAssignment,
  toggleAcademicYearSelection,
  academicYearSectionVisible,
} from '@/lib/ui-prefs'
import { ACADEMIC_SHIFT_LABEL_KEY, type AcademicShift } from '@/lib/institute'

// Global Shift Selection (issue #577, Wave 5/#590): a per-user, per-request
// view preference narrowing class/roster lists to the Shifts currently being
// worked with — never an authorization input, never touching RLS. Modeled on
// NotificationBell's popover mechanics (ref-anchored, measured sheetTop,
// outside-click/Escape dismiss) and ThemeSwitch's cookie-write +
// router.refresh() persistence — this is pure view preference like theme/
// sidebar/lang, so there's no server round trip, just a cookie write.
//
// Map #609 / ticket #613 folds a second section into the same popover: the
// Global Academic Year Selection. It's the year twin of the shift preference —
// same cookie-write + router.refresh() persistence, same "no new top-bar icon".
// It renders only for a School that has *started* more than one Academic Year;
// a single-year School sees exactly today's Shift-only popover, and the current
// year's row is always checked and disabled (it can never be deselected).
export function ShiftSelector({
  lang,
  buttonClass,
  configuredShifts,
  initialSelection,
  startedAcademicYears = [],
  activeAcademicYear = null,
  academicYearSelection = [],
}: {
  lang: Lang
  buttonClass: string
  configuredShifts: readonly string[]
  initialSelection: readonly string[]
  /** Academic Years this School has actually started (SchoolContext,
   *  #609/#610), newest first. The Academic Year section renders only when
   *  there is more than one. */
  startedAcademicYears?: readonly number[]
  /** schools.active_academic_year — the row that is always checked and never
   *  deselectable. null for a School whose row predates the backfill. */
  activeAcademicYear?: number | null
  /** The effective Global Academic Year Selection from SchoolContext, already
   *  reconciled + guaranteed to contain activeAcademicYear when non-null. */
  academicYearSelection?: readonly number[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selection, setSelection] = useState<string[]>([...initialSelection])
  const [yearSelection, setYearSelection] = useState<number[]>([...academicYearSelection])
  // Where the phone-width sheet starts: measured from the trigger as it
  // opens, matching NotificationBell's issue #118 fix.
  const [sheetTop, setSheetTop] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) setSheetTop(ref.current ? Math.round(ref.current.getBoundingClientRect().bottom + 8) : null)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const showShiftSection = configuredShifts.length > 0
  // Only a School spanning more than one started year gets a choice to make.
  const showYearSection = academicYearSectionVisible(startedAcademicYears)

  // Nothing to select on either axis (a No-Shift, single-year School) — absent
  // entirely, not rendered-but-disabled (#577's resolution).
  if (!showShiftSection && !showYearSection) return null

  function toggleShift(shift: string) {
    // The sole remaining checked box can't be unchecked client-side. Not a
    // correctness backstop (parseShiftSelection repairs an empty cookie to
    // "all configured" regardless) — just avoiding a pointless round trip
    // through the fallback for what would otherwise look like "select none".
    if (selection.includes(shift) && selection.length === 1) return
    const next = selection.includes(shift) ? selection.filter((s) => s !== shift) : [...selection, shift]
    setSelection(next)
    document.cookie = shiftSelectionCookieAssignment(next)
    router.refresh()
  }

  function toggleYear(year: number) {
    // The active year is permanently checked — toggleAcademicYearSelection
    // makes this a no-op, but bail before the cookie write / refresh too.
    if (year === activeAcademicYear) return
    const next = toggleAcademicYearSelection(yearSelection, year, activeAcademicYear)
    setYearSelection(next)
    document.cookie = academicYearSelectionCookieAssignment(next)
    router.refresh()
  }

  // Header + per-list group labels: a single-section popover keeps today's
  // exact "Shift Selection" bar; with both sections the bar goes generic and
  // each list carries its own sub-heading.
  const headerKey = showYearSection ? 'shell.viewSelection' : 'shell.shiftSelection'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={t(showShiftSection ? 'shell.shiftSelection' : 'shell.academicYearSelection', lang)}
        aria-expanded={open}
        onClick={toggle}
        className={`${buttonClass} text-muted hover:bg-brand-50 hover:text-brand-600`}
      >
        <Icon name="layers" className="size-5" />
      </button>

      {open && (
        <div
          style={sheetTop === null ? undefined : ({ '--sheet-top': `${sheetTop}px` } as React.CSSProperties)}
          className="fixed inset-x-3 top-[var(--sheet-top,4rem)] z-50 flex max-h-[calc(100dvh-var(--sheet-top,4rem)-0.75rem)] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:max-h-none sm:w-64 sm:max-w-[calc(100vw-1.5rem)]"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-bold uppercase tracking-wide text-muted">{t(headerKey, lang)}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {showShiftSection && (
              <ul className="p-2">
                {showYearSection && (
                  <li className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-muted">
                    {t('shell.shiftSelection', lang)}
                  </li>
                )}
                {configuredShifts.map((shift) => (
                  <li key={shift}>
                    <label className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm hover:bg-brand-50/60">
                      <input type="checkbox" checked={selection.includes(shift)} onChange={() => toggleShift(shift)} />
                      {t(ACADEMIC_SHIFT_LABEL_KEY[shift as AcademicShift] ?? ACADEMIC_SHIFT_LABEL_KEY.Morning, lang)}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {showYearSection && (
              <ul className="border-t border-line p-2">
                <li className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-muted">
                  {t('shell.academicYearSelection', lang)}
                </li>
                {startedAcademicYears.map((year) => {
                  const isActive = year === activeAcademicYear
                  return (
                    <li key={year}>
                      <label
                        className={`flex items-center gap-2 rounded-xl px-2 py-2 text-sm ${isActive ? 'opacity-70' : 'hover:bg-brand-50/60'}`}
                      >
                        <input
                          type="checkbox"
                          checked={isActive || yearSelection.includes(year)}
                          disabled={isActive}
                          onChange={() => toggleYear(year)}
                        />
                        {year}
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
