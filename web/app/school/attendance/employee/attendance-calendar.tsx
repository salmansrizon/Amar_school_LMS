'use client'

import { Popover } from '@base-ui/react/popover'
import { t, type Lang } from '@/lib/i18n'
import { attendanceBand } from '@/lib/dashboard'
import { formatDayLong, localizeNumber, type SchoolAttendanceDayCell } from '@/lib/employee-attendance-calendar'

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
  else if (cell.isFuture) parts.push(t('attendance.calendarUpcoming', lang))
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
  return (
    <span
      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
        isToday ? 'bg-brand-500 text-white' : cell.iso ? 'text-ink' : 'text-muted/50'
      }`}
    >
      {localizeNumber(cell.day ?? 0, lang)}
    </span>
  )
}

const cellFrame = 'flex h-16 w-full flex-col gap-1 p-1 text-left sm:h-26 sm:p-1.5'

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
  const weekendTint = isWeekend ? 'bg-paper-muted/40' : ''

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
        data-iso={cell.iso}
        className={`${cellFrame} ${cell.isOff ? '' : weekendTint}`}
        style={cell.isOff ? { backgroundImage: 'repeating-linear-gradient(135deg, var(--color-alert-soft), var(--color-alert-soft) 6px, transparent 6px 12px)' } : undefined}
      >
        <DayNumber cell={cell} lang={lang} isToday={isToday} />
        {cell.isOff && <span className="hidden truncate text-[10px] font-semibold text-alert-deep sm:block">{t('status.holiday', lang)}</span>}
        {!cell.isOff && cell.isFuture && <span className="hidden truncate text-[10px] text-muted sm:block">{t('attendance.calendarUpcoming', lang)}</span>}
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
        data-iso={cell.iso}
        className={`${cellFrame} ${weekendTint} cursor-pointer hover:bg-paper-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300`}
      >
        <div className="flex items-center justify-between">
          <DayNumber cell={cell} lang={lang} isToday={isToday} />
          <span className={`size-2 rounded-full sm:hidden ${BAND_DOT[band]}`} aria-hidden />
        </div>
        <div className={`hidden flex-col gap-0.5 sm:flex ${BAND_TONE[band]} rounded-md px-1.5 py-1`}>
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
