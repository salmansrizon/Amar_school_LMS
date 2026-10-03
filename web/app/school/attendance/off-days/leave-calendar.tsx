'use client'

import { Popover } from '@base-ui/react/popover'
import { t, type Lang } from '@/lib/i18n'
import { formatDayLong, localizeNumber, type LeaveCalendarDayCell as LeaveCalendarDayCellData } from '@/lib/employee-attendance-calendar'
import { AddOffDayForm, DeleteOffDayButton } from './off-day-controls'
import { LeaveStatusPill } from '../leave/leave-shared'

// The Leave Calendar's day cell (map 013 follow-up, calendar polish pass):
// one cell of the shared MonthGridFrame (../calendar-shell.tsx), overlaying
// employee leave onto the existing off_days data. A day is a Popover.Trigger
// (a real <button>, so Tab reaches every day and Enter/Space opens it) rather
// than a Dialog — clicking it either offers to remove the day's off-day
// (existing DeleteOffDayButton) or add one (existing AddOffDayForm,
// pre-filled), plus name chips for whoever is on leave that day.

function dayAriaLabel(cell: LeaveCalendarDayCellData, lang: Lang): string {
  const parts = [formatDayLong(cell.iso as string, lang)]
  if (cell.label) parts.push(cell.label)
  if (cell.approved.length) parts.push(`${localizeNumber(cell.approved.length, lang)} ${t('status.on_leave', lang)}`)
  if (cell.pending.length) parts.push(`${localizeNumber(cell.pending.length, lang)} ${t('attendance.leavePending', lang)}`)
  return parts.join(', ')
}

function DayPopoverContent({ cell, lang }: { cell: LeaveCalendarDayCellData; lang: Lang }) {
  return (
    <div className="w-72 max-w-[80vw] space-y-3">
      <p className="text-sm font-bold">
        {formatDayLong(cell.iso as string, lang)}
        {cell.label ? ` — ${cell.label}` : ''}
      </p>

      {(cell.approved.length > 0 || cell.pending.length > 0) && (
        <div className="space-y-1.5 text-xs">
          {cell.approved.map((p, i) => (
            <p key={`a-${i}`} className="flex items-center justify-between gap-2">
              <span className="truncate">{p.name}</span>
              {/* Same LeaveStatusPill the Student/Employee leave lists and
                  drawers use (leave-shared.tsx) — one pill convention for
                  "approved"/"pending" everywhere it appears, not a
                  hand-rolled dot here. */}
              <LeaveStatusPill status="approved" lang={lang} />
            </p>
          ))}
          {cell.pending.map((p, i) => (
            <p key={`p-${i}`} className="flex items-center justify-between gap-2">
              <span className="truncate">{p.name}</span>
              <LeaveStatusPill status="pending" lang={lang} />
            </p>
          ))}
        </div>
      )}

      <div className="border-t border-line pt-3">
        {cell.hasOffDayRow ? (
          <>
            <p className="mb-2 text-xs font-semibold text-muted">{t('attendance.offDayRemoveTitle', lang)}</p>
            <DeleteOffDayButton day={cell.iso as string} lang={lang} />
          </>
        ) : (
          <>
            <p className="mb-2 text-xs font-semibold text-muted">{t('attendance.offDayAddTitle', lang)}</p>
            <AddOffDayForm lang={lang} defaultDay={cell.iso as string} />
          </>
        )}
      </div>
    </div>
  )
}

function DayNumber({ day, lang, isToday, muted }: { day: number | null; lang: Lang; isToday: boolean; muted: boolean }) {
  return (
    <span
      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
        isToday ? 'bg-brand-500 text-white' : muted ? 'text-muted/50' : 'text-ink'
      }`}
    >
      {localizeNumber(day ?? 0, lang)}
    </span>
  )
}

function NameChip({ name, status }: { name: string; status: 'approved' | 'pending' }) {
  return (
    <span
      className={`truncate rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
        status === 'approved' ? 'bg-mint text-white' : 'border border-dashed border-sun-deep text-sun-deep'
      }`}
    >
      {name}
    </span>
  )
}

const cellFrame = 'flex h-16 w-full flex-col gap-1 p-1 text-left sm:h-26 sm:p-1.5'

export function LeaveCalendarDayCell({
  cell,
  lang,
  isToday,
  isWeekend,
}: {
  cell: LeaveCalendarDayCellData
  lang: Lang
  isToday: boolean
  isWeekend: boolean
}) {
  const weekendTint = isWeekend ? 'bg-paper-muted/40' : ''

  if (!cell.iso) {
    return (
      <div className={`${cellFrame} ${weekendTint}`} aria-hidden>
        <DayNumber day={cell.day} lang={lang} isToday={false} muted />
      </div>
    )
  }

  const people = [
    ...cell.approved.map((p) => ({ name: p.name, status: 'approved' as const })),
    ...cell.pending.map((p) => ({ name: p.name, status: 'pending' as const })),
  ]
  // One chip on an off-day: its label takes the second line of the fixed-height cell.
  const shown = people.slice(0, cell.isOff ? 1 : 2)
  const overflow = people.length - shown.length

  const stripedOff = cell.isOff && !cell.isSignificant
  const toneClass = cell.isSignificant ? 'bg-sky-soft' : stripedOff ? '' : weekendTint

  return (
    <Popover.Root>
      <Popover.Trigger
        role="gridcell"
        aria-label={dayAriaLabel(cell, lang)}
        data-iso={cell.iso}
        className={`${cellFrame} ${toneClass} cursor-pointer hover:bg-paper-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300`}
        style={stripedOff ? { backgroundImage: 'repeating-linear-gradient(135deg, var(--color-alert-soft), var(--color-alert-soft) 6px, transparent 6px 12px)' } : undefined}
      >
        <div className="flex items-center justify-between">
          <DayNumber day={cell.day} lang={lang} isToday={isToday} muted={false} />
          {people.length > 0 && (
            <span className="flex items-center gap-0.5 sm:hidden">
              {cell.approved.length > 0 && <span className="size-2 rounded-full bg-mint" aria-hidden />}
              {cell.pending.length > 0 && <span className="size-2 rounded-full border border-dashed border-sun-deep" aria-hidden />}
            </span>
          )}
        </div>
        {cell.isOff && (
          <span className={`hidden shrink-0 truncate text-[10px] font-semibold sm:block ${cell.isSignificant ? 'text-sky-deep' : 'text-alert-deep'}`}>
            {cell.label ?? t('status.holiday', lang)}
          </span>
        )}
        {people.length > 0 && (
          <div className="hidden flex-col gap-0.5 sm:flex">
            {shown.map((p, i) => (
              <NameChip key={i} name={p.name} status={p.status} />
            ))}
            {overflow > 0 && (
              <span className="text-[9px] font-semibold text-muted">{t('attendance.moreCount', lang).replace('{n}', localizeNumber(overflow, lang))}</span>
            )}
          </div>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="center" sideOffset={6} className="z-50">
          {/* No focus jump on touch: the add-off-day form's date input would
              pop the phone keyboard/date picker before the reader has seen the day. */}
          <Popover.Popup
            initialFocus={(openType) => openType !== 'touch'}
            aria-label={formatDayLong(cell.iso, lang)}
            data-iso={cell.iso}
            className="rounded-2xl border border-line bg-paper p-3 shadow-xl outline-none motion-safe:transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
          >
            <DayPopoverContent cell={cell} lang={lang} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
