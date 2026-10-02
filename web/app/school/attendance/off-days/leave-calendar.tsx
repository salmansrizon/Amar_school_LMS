'use client'

import Link from 'next/link'
import { Popover } from '@base-ui/react/popover'
import { t, type Lang } from '@/lib/i18n'
import { WEEKDAY_SHORT, type LeaveCalendarDayCell } from '@/lib/employee-attendance-calendar'
import { AddOffDayForm, DeleteOffDayButton } from './off-day-controls'
import { LeaveStatusPill } from '../leave/leave-shared'

// The Leave Calendar (map 013 follow-up): one interactive month grid on the
// existing Off-Day Calendar tab, overlaying employee leave onto the same
// off_days data the tab already manages. A day is a Popover.Trigger (a real
// <button>, so Tab reaches every day and Enter/Space opens it) rather than a
// Dialog — clicking it either offers to remove the day's off-day (existing
// DeleteOffDayButton) or add one (existing AddOffDayForm, pre-filled), plus
// whoever is on leave that day. The old 12-month mini-grid + flat list stay
// reachable via the page's List toggle, byte-for-byte unchanged.

function dayAriaLabel(cell: LeaveCalendarDayCell, lang: Lang): string {
  const parts = [cell.iso as string]
  if (cell.label) parts.push(cell.label)
  if (cell.approved.length) parts.push(`${cell.approved.length} ${t('status.on_leave', lang)}`)
  if (cell.pending.length) parts.push(`${cell.pending.length} ${t('attendance.leavePending', lang)}`)
  return parts.join(', ')
}

function DayPopoverContent({ cell, lang }: { cell: LeaveCalendarDayCell; lang: Lang }) {
  return (
    <div className="w-72 max-w-[80vw] space-y-3">
      <p className="text-sm font-bold">
        {cell.iso}
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

export function LeaveCalendarGrid({
  cells,
  monthLabel,
  prevHref,
  nextHref,
  lang,
}: {
  cells: LeaveCalendarDayCell[]
  monthLabel: string
  prevHref: string
  nextHref: string
  lang: Lang
}) {
  const navClass = 'inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-paper-muted hover:text-ink'
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link href={prevHref} scroll={false} aria-label={t('attendance.calendarPrevMonth', lang)} className={navClass}>
          ‹
        </Link>
        <h3 className="font-bold">{monthLabel}</h3>
        <Link href={nextHref} scroll={false} aria-label={t('attendance.calendarNextMonth', lang)} className={navClass}>
          ›
        </Link>
      </div>

      <div role="grid" aria-label={monthLabel} className="grid grid-cols-7 gap-1">
        {WEEKDAY_SHORT.map((w) => (
          <span key={w.en} role="columnheader" className="py-1 text-center text-xs font-semibold text-muted">
            {w[lang]}
          </span>
        ))}
        {cells.map((cell, i) =>
          cell.iso ? (
            <Popover.Root key={cell.iso}>
              <Popover.Trigger
                role="gridcell"
                aria-label={dayAriaLabel(cell, lang)}
                className={`flex min-h-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                  cell.isSignificant
                    ? 'bg-sky-soft text-sky-deep'
                    : cell.isOff
                      ? 'bg-alert-soft text-alert-deep'
                      : 'hover:bg-paper-muted'
                }`}
              >
                <span className="text-xs font-semibold">{cell.day}</span>
                {(cell.approved.length > 0 || cell.pending.length > 0) && (
                  <span className="flex items-center gap-0.5">
                    {cell.approved.length > 0 && (
                      <span className="rounded-full bg-mint px-1 text-[9px] font-bold text-white">{cell.approved.length}</span>
                    )}
                    {cell.pending.length > 0 && (
                      <span className="rounded-full border border-dashed border-sun-deep px-1 text-[9px] font-bold text-sun-deep">
                        {cell.pending.length}
                      </span>
                    )}
                  </span>
                )}
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner side="bottom" align="center" sideOffset={6} className="z-50">
                  <Popover.Popup
                    aria-label={cell.iso}
                    className="rounded-2xl border border-line bg-paper p-3 shadow-xl outline-none motion-safe:transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
                  >
                    <DayPopoverContent cell={cell} lang={lang} />
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          ) : (
            <div key={`blank-${i}`} aria-hidden />
          ),
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-alert-soft" /> {t('attendance.offDayLegendRegular', lang)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-sky-soft" /> {t('attendance.offDayLegendSignificant', lang)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="rounded-full bg-mint px-1.5 text-[10px] font-bold text-white">3</span> {t('status.on_leave', lang)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="rounded-full border border-dashed border-sun-deep px-1.5 text-[10px] font-bold text-sun-deep">1</span>{' '}
          {t('attendance.leavePending', lang)}
        </span>
      </div>
    </div>
  )
}
