'use client'

import { Popover } from '@base-ui/react/popover'
import { t, type Lang } from '@/lib/i18n'
import { attendanceBand } from '@/lib/dashboard'
import { formatDayLong, localizeNumber, type SchoolAttendanceDayCell } from '@/lib/employee-attendance-calendar'
import { CAL_CELL, CAL_CHIP, CAL_WEEKEND, CalendarDayNumber } from '@/app/school/attendance/calendar-shell'

// The school-wide Employee Attendance Calendar's day cell (map 013 follow-up,
// calendar polish pass): one cell of the shared MonthGridFrame
// (../calendar-shell.tsx). A day with a rate is a Popover.Trigger with
// openOnHover — desktop gets the per-employee breakdown on hover, touch/
// mobile gets it on tap (Trigger opens on press by default; openOnHover only
// adds hover as a second way in), same primitive as
// components/data-table/row-more.tsx.

const BAND_TONE = { regular: 'bg-mint-soft text-mint-deep', irregular: 'bg-sun-soft text-sun-deep', atRisk: 'bg-alert-soft text-alert-deep' } as const
const BAND_DOT = { regular: 'bg-mint', irregular: 'bg-sun-deep', atRisk: 'bg-alert' } as const

function hhmm(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(11, 16)
}

function dayAriaLabel(cell: SchoolAttendanceDayCell, lang: Lang): string {
  const parts = [formatDayLong(cell.iso as string, lang)]
  if (cell.isOff) parts.push(t('status.holiday', lang))
  else if (cell.noRecord) parts.push(t('status.no_record', lang))
  else if (cell.isFuture) parts.push(cell.leaveCount ? `${localizeNumber(cell.leaveCount, lang)} ${t('status.on_leave', lang)}` : t('attendance.calendarUpcoming', lang))
  else if (cell.rate !== null) parts.push(
      `${localizeNumber(cell.rate, lang)}% (${localizeNumber(cell.presentCount, lang)}/${localizeNumber(cell.totalCount, lang)})`,
    )
  return parts.join(', ')
}

function DayPopoverContent({ cell, lang }: { cell: SchoolAttendanceDayCell; lang: Lang }) {
  const STATUS_LABEL: Record<SchoolAttendanceDayCell['employees'][number]['status'], string> = {
    present: t('status.present', lang),
    absent: t('status.absent', lang),
    on_leave: t('status.on_leave', lang),
    no_record: t('status.no_record', lang),
  }
  return (
    <div className="w-72 max-w-[80vw]">
      <p className="mb-2 text-sm font-bold">{formatDayLong(cell.iso as string, lang)}</p>
      <p className="mb-2 text-xs font-semibold text-muted">{t('attendance.dayStatusTitle', lang)}</p>
      <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
        {cell.employees.map((e, i) => (
          <li key={i} className="flex items-center justify-between gap-2">
            <span className="truncate">{e.name}</span>
            <span className="shrink-0 text-muted">
              {STATUS_LABEL[e.status]}
              {e.status === 'present' && e.entry ? ` · ${hhmm(e.entry)}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DayNumber({ cell, lang, isToday }: { cell: SchoolAttendanceDayCell; lang: Lang; isToday: boolean }) {
  return <CalendarDayNumber label={localizeNumber(cell.day ?? 0, lang)} isToday={isToday} muted={!cell.iso} />
}

const cellFrame = CAL_CELL

export function EmployeeAttendanceDayCell({
  cell,
  lang,
  isToday,
  isWeekend,
}: {
  cell: SchoolAttendanceDayCell
  lang: Lang
  isToday: boolean
  isWeekend: boolean
}) {
  const weekendTint = isWeekend ? CAL_WEEKEND : ''

  // Adjacent-month blank — muted, day number only, no content.
  if (!cell.iso) {
    return (
      <div className={`${cellFrame} ${weekendTint}`} aria-hidden>
        <DayNumber cell={cell} lang={lang} isToday={false} />
      </div>
    )
  }

  if (cell.isOff || cell.isFuture || cell.rate === null) {
    return (
      <div
        role="gridcell"
        aria-label={dayAriaLabel(cell, lang)}
        aria-current={isToday ? 'date' : undefined}
        data-iso={cell.iso}
        className={`${cellFrame} ${weekendTint}`}
      >
        <div className="flex items-center justify-between">
          <DayNumber cell={cell} lang={lang} isToday={isToday} />
          {cell.isOff && <span className="size-2 rounded-full bg-alert sm:hidden" aria-hidden />}
        </div>
        {cell.isOff && <span className={`hidden sm:block ${CAL_CHIP} bg-alert-soft text-alert-deep`}>{t('status.holiday', lang)}</span>}
        {!cell.isOff && cell.noRecord && <span className={`hidden sm:block ${CAL_CHIP} bg-paper-muted text-muted`}>{t('status.no_record', lang)}</span>}
        {!cell.isOff && cell.isFuture && <span className="hidden truncate text-[10px] text-muted sm:block">{cell.leaveCount ? `${t('status.on_leave', lang)} ${localizeNumber(cell.leaveCount, lang)}` : t('attendance.calendarUpcoming', lang)}</span>}
      </div>
    )
  }

  const band = attendanceBand(cell.rate)
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={150}
        role="gridcell"
        aria-label={dayAriaLabel(cell, lang)}
        aria-current={isToday ? 'date' : undefined}
        data-iso={cell.iso}
        className={`${cellFrame} ${weekendTint} cursor-pointer hover:bg-paper-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300`}
      >
        <div className="flex items-center justify-between">
          <DayNumber cell={cell} lang={lang} isToday={isToday} />
          <span className={`size-2 rounded-full sm:hidden ${BAND_DOT[band]}`} aria-hidden />
        </div>
        <div className={`hidden flex-col gap-0.5 sm:flex ${BAND_TONE[band]} rounded px-1.5 py-1`}>
          <span className="text-xs font-bold">{localizeNumber(cell.rate ?? 0, lang)}%</span>
          <span className="text-[10px] leading-tight opacity-80">
            {localizeNumber(cell.presentCount, lang)}/{localizeNumber(cell.totalCount, lang)}
          </span>
        </div>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="center" sideOffset={6} className="z-50">
          <Popover.Popup
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
