import Link from 'next/link'
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { WEEKDAY_SHORT, isWeekendColumn } from '@/lib/employee-attendance-calendar'

// The shared month-calendar shell (calendar polish, map 013 follow-up): one
// toolbar and one grid frame reused by all three calendars — the per-employee
// month view (employees/[id]/attendance), the school-wide Employee Attendance
// Calendar (attendance/employee) and the Leave Calendar (attendance/off-days)
// — replacing each one's own copy of the ‹ title › row and the bare
// `grid-cols-7` wrapper. What differs per calendar (cell content, whether a
// day is a Popover.Trigger) stays with each calendar's own day-cell
// component, passed in as `children`/a rendered list rather than a function
// prop — these pages are Server Components, and a function can't cross to a
// Client Component as a prop, only elements/children can.

const navBtn = 'inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-paper-muted hover:text-ink'

export function CalendarToolbar({
  monthLabel,
  prevHref,
  nextHref,
  todayHref,
  lang,
  trailing,
  reload = false,
}: {
  monthLabel: string
  prevHref: string
  nextHref: string
  todayHref: string
  lang: Lang
  /** The view switch (or any other control) sharing this same toolbar row. */
  trailing?: ReactNode
  /** Plain <a> (full load) instead of a client Link — for a page whose own
   *  path an intercepting popup route would otherwise catch. */
  reload?: boolean
}) {
  const nav = (href: string, className: string, label: string, children: ReactNode) =>
    reload ? (
      <a href={href} aria-label={label} className={className}>
        {children}
      </a>
    ) : (
      <Link href={href} scroll={false} aria-label={label} className={className}>
        {children}
      </Link>
    )
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-full border border-line p-0.5">
        {nav(prevHref, navBtn, t('attendance.calendarPrevMonth', lang), <ChevronLeft className="size-4" />)}
        {nav(nextHref, navBtn, t('attendance.calendarNextMonth', lang), <ChevronRight className="size-4" />)}
      </div>
      <h3 className="min-w-[9ch] text-center font-bold">{monthLabel}</h3>
      {/* Icon-only below sm, so a view switch still fits on this row at 390px. */}
      {nav(
        todayHref,
        'inline-flex items-center rounded-full border border-line px-2.5 py-1.5 text-xs font-semibold hover:bg-paper-muted sm:px-3',
        t('attendance.calendarToday', lang),
        <>
          <CalendarCheck className="size-4 sm:hidden" />
          <span className="hidden sm:inline">{t('attendance.calendarToday', lang)}</span>
        </>,
      )}
      {trailing}
    </div>
  )
}

/** The bordered weekday-header + 7-column frame every month grid shares.
 *  `children` is the already-rendered list of day cells (one per grid slot,
 *  in order) — this component only owns the chrome around them: the header
 *  row, the weekend column tint, and the grid's own role/aria-label. */
export function MonthGridFrame({
  monthLabel,
  lang,
  weeklyOffDays,
  children,
}: {
  monthLabel: string
  lang: Lang
  weeklyOffDays: readonly number[]
  children: ReactNode
}) {
  return (
    <div role="grid" aria-label={monthLabel} className="overflow-hidden rounded-xl border border-line">
      <div className="grid grid-cols-7">
        {WEEKDAY_SHORT.map((w, i) => (
          <span
            key={w.en}
            role="columnheader"
            className={`border-b border-line py-2 text-center text-xs font-semibold text-muted ${
              isWeekendColumn(i, weeklyOffDays) ? 'bg-paper-muted/60' : 'bg-paper-muted/20'
            }`}
          >
            {w[lang]}
          </span>
        ))}
      </div>
      {/* -mb-px/-mr-px tuck the last row/column's divide borders under the frame's own border. */}
      <div className="-mr-px -mb-px grid grid-cols-7 divide-x divide-y divide-line">{children}</div>
    </div>
  )
}
