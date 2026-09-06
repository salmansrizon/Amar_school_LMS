'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/school-icons'
import { t, type Lang } from '@/lib/i18n'
import { shiftSelectionCookieAssignment } from '@/lib/ui-prefs'
import { ACADEMIC_SHIFT_LABEL_KEY, type AcademicShift } from '@/lib/institute'

// Global Shift Selection (issue #577, Wave 5/#590): a per-user, per-request
// view preference narrowing class/roster lists to the Shifts currently being
// worked with — never an authorization input, never touching RLS. Modeled on
// NotificationBell's popover mechanics (ref-anchored, measured sheetTop,
// outside-click/Escape dismiss) and ThemeSwitch's cookie-write +
// router.refresh() persistence — this is pure view preference like theme/
// sidebar/lang, so there's no server round trip, just a cookie write.
export function ShiftSelector({
  lang,
  buttonClass,
  configuredShifts,
  initialSelection,
}: {
  lang: Lang
  buttonClass: string
  configuredShifts: readonly string[]
  initialSelection: readonly string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selection, setSelection] = useState<string[]>([...initialSelection])
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

  // A No-Shift institute has nothing to select — absent entirely, not
  // rendered-but-disabled (#577's resolution).
  if (configuredShifts.length === 0) return null

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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={t('shell.shiftSelection', lang)}
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
            <span className="text-sm font-bold uppercase tracking-wide text-muted">
              {t('shell.shiftSelection', lang)}
            </span>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {configuredShifts.map((shift) => (
              <li key={shift}>
                <label className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm hover:bg-brand-50/60">
                  <input type="checkbox" checked={selection.includes(shift)} onChange={() => toggleShift(shift)} />
                  {t(ACADEMIC_SHIFT_LABEL_KEY[shift as AcademicShift] ?? ACADEMIC_SHIFT_LABEL_KEY.Morning, lang)}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
