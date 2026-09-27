'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { formatTime12h } from '@/lib/office-hours'
import { inputClass } from '@/components/auth-card'
import { updateOfficeHourCell, deleteOfficeHourCell } from './actions'
import { officeHourErrorMessage } from './error-messages'

// Office Hour matrix cell (issue #643 §5/§6): mirrors SlotCell's click-to-edit
// interaction shape (web/app/school/classes/routine/routine-cell.tsx), but
// editing only ever changes Start/End Time — the cell's Shift, Employee
// Category and Day are fixed by its position in the matrix, so there is no
// select/dropdown here, just the two time inputs.

export function OfficeHourCell({
  id,
  startTime,
  endTime,
  lang,
}: {
  id: string
  startTime: string
  endTime: string
  lang: Lang
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [start, setStart] = useState(startTime.slice(0, 5))
  const [end, setEnd] = useState(endTime.slice(0, 5))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null)
          setStart(startTime.slice(0, 5))
          setEnd(endTime.slice(0, 5))
          setEditing(true)
        }}
        // A neutral card, not a colored pill: the matrix cell itself now
        // carries the day's own color band (page.tsx's dayColumnClass), so a
        // colored pill here would blend into or clash with it. This floats
        // cleanly on top of any day's tint.
        className="w-full cursor-pointer rounded-full border border-line-strong bg-paper px-2 py-1 text-center text-xs font-semibold text-ink shadow-sm hover:border-brand-500 hover:text-brand-600"
      >
        {formatTime12h(startTime)} – {formatTime12h(endTime)}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1 p-1">
      <input
        type="time"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        aria-label={t('officeHour.startTime', lang)}
        className={`${inputClass} h-8 text-xs`}
      />
      <input
        type="time"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        aria-label={t('officeHour.endTime', lang)}
        className={`${inputClass} h-8 text-xs`}
      />
      {error && <span className="text-[11px] text-alert-deep">{officeHourErrorMessage(error, lang)}</span>}
      <div className="flex gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const result = await updateOfficeHourCell(id, start, end)
              if (result.error) setError(result.error)
              else {
                setEditing(false)
                router.refresh()
              }
            })
          }
          className="flex-1 cursor-pointer rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          {t('officeHour.save', lang)}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="cursor-pointer rounded-full border border-line-strong px-2 py-0.5 text-[11px] font-semibold"
        >
          ✕
        </button>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          // Permanent hard delete (issue #643 decision) — a misclick must not
          // silently erase a published schedule entry, matching the
          // window.confirm guard venues/venue-controls.tsx's DeleteVenueButton
          // already uses for the same class of irreversible action.
          if (!window.confirm(t('officeHour.confirmRemove', lang))) return
          startTransition(async () => {
            setError(null)
            const result = await deleteOfficeHourCell(id)
            if (result.error) setError(result.error)
            else router.refresh()
          })
        }}
        className="cursor-pointer rounded-full border border-alert-deep/40 px-2 py-0.5 text-[11px] font-semibold text-alert-deep disabled:opacity-50"
      >
        {t('officeHour.remove', lang)}
      </button>
    </div>
  )
}
