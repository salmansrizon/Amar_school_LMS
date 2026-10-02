'use client'

import Link from 'next/link'
import { Popover } from '@base-ui/react/popover'
import { t, type Lang } from '@/lib/i18n'
import { attendanceBand } from '@/lib/dashboard'
import { WEEKDAY_SHORT, type SchoolAttendanceDayCell } from '@/lib/employee-attendance-calendar'

// The school-wide Employee Attendance Calendar (map 013 follow-up): one
// active month, each day shaded by that day's employee attendance rate. A day
// is a Popover.Trigger with openOnHover — desktop gets the per-employee
// breakdown on hover, touch/mobile gets it on tap (Trigger opens on press by
// default; openOnHover only adds hover as a second way in), same primitive as
// components/data-table/row-more.tsx. The existing daily table stays reachable
// via the page's own Table toggle, unchanged.

const BAND_TONE = { regular: 'bg-mint-soft text-mint-deep', irregular: 'bg-sun-soft text-sun-deep', atRisk: 'bg-alert-soft text-alert-deep' } as const

function hhmm(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(11, 16)
}

function dayAriaLabel(cell: SchoolAttendanceDayCell, lang: Lang): string {
  const parts = [cell.iso as string]
  if (cell.isOff) parts.push(t('status.holiday', lang))
  else if (cell.isFuture) parts.push(t('attendance.calendarUpcoming', lang))
  else if (cell.rate !== null) parts.push(`${cell.rate}% (${cell.presentCount}/${cell.totalCount})`)
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
      <p className="mb-2 text-sm font-bold">{cell.iso}</p>
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

export function EmployeeAttendanceCalendar({
  cells,
  monthLabel,
  prevHref,
  nextHref,
  lang,
}: {
  cells: SchoolAttendanceDayCell[]
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
            cell.isOff || cell.isFuture || cell.rate === null ? (
              <div
                key={cell.iso}
                role="gridcell"
                aria-label={dayAriaLabel(cell, lang)}
                className="flex min-h-11 flex-col items-center justify-center rounded-lg bg-paper-muted px-0.5 py-1 text-center text-muted"
              >
                <span className="text-xs font-semibold">{cell.day}</span>
                <span className="text-[9px] leading-tight">
                  {cell.isOff ? t('status.holiday', lang) : cell.isFuture ? t('attendance.calendarUpcoming', lang) : ''}
                </span>
              </div>
            ) : (
              <Popover.Root key={cell.iso}>
                <Popover.Trigger
                  openOnHover
                  delay={150}
                  role="gridcell"
                  aria-label={dayAriaLabel(cell, lang)}
                  className={`flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-lg px-0.5 py-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${BAND_TONE[attendanceBand(cell.rate)]}`}
                >
                  <span className="text-xs font-semibold">{cell.day}</span>
                  <span className="text-[9px] font-semibold leading-tight">{cell.rate}%</span>
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
            )
          ) : (
            <div key={`blank-${i}`} aria-hidden />
          ),
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-mint-soft" /> {t('attendance.regular', lang)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-sun-soft" /> {t('attendance.irregular', lang)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-alert-soft" /> {t('attendance.atRisk', lang)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-paper-muted" /> {t('status.holiday', lang)} / {t('attendance.calendarUpcoming', lang)}
        </span>
      </div>
    </div>
  )
}
