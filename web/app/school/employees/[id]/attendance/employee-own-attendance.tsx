import { notFound } from 'next/navigation'
import { CalendarCheck, CalendarX, CalendarClock } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, formatDate, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { employeeCategoryLabel } from '@/lib/employees'
import { schoolToday } from '@/lib/school-time'
import {
  parseMonthParam,
  shiftYearMonth,
  formatMonthYear,
  buildEmployeeMonthCalendar,
  summarizeEmployeeMonth,
  isWeekendColumn,
  localizeNumber,
  type EmployeeCalendarCell,
} from '@/lib/employee-attendance-calendar'
import { loadEmployeeAttendanceStarts } from '@/lib/school/employee-attendance-starts-source'
import { selectAllRows } from '@/lib/supabase/select-all'
import { loadLastAgentHeartbeat, agentNotSyncedFor } from '@/lib/school/attendance-agent-sync'
import { AgentSyncWarning } from '@/app/school/attendance/agent-sync-warning'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { LeaveStatusPill } from '@/app/school/attendance/leave/leave-shared'
import { LeaveActions } from '@/app/school/attendance/leave/leave-controls'
import { CalendarToolbar, MonthGridFrame, CAL_CELL, CAL_CHIP, CAL_OUTSIDE, CAL_WEEKEND, CalendarDayNumber } from '../../../attendance/calendar-shell'

// The employees list's "View attendance" row action (map 013 follow-up): a
// focused view of ONE employee's own attendance — a month calendar, its
// summary, and their own leave requests. Deliberately not the school-wide
// attendance/leave pages filtered by name (the old approach): those carry
// every other employee's tabs and controls, which a single-employee popup has
// no room — or need — for. See app/school/@modal/(.)employees/[id]/attendance
// for why this lives at its own path rather than intercepting the shared
// /school/attendance/employee route.

const CELL_TONE: Record<Exclude<EmployeeCalendarCell['status'], null>, string> = {
  present: 'bg-mint-soft text-mint-deep',
  absent: 'bg-alert-soft text-alert-deep',
  on_leave: 'bg-sky-soft text-sky-deep',
  off: 'bg-paper-muted text-muted',
  future: 'text-muted',
  not_started: 'text-muted',
  no_record: 'bg-paper-muted text-muted',
}

function hhmm(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(11, 16)
}

function cellStatusLabel(status: Exclude<EmployeeCalendarCell['status'], null>, lang: Lang): string {
  if (status === 'off') return t('status.holiday', lang)
  if (status === 'future') return t('attendance.calendarUpcoming', lang)
  if (status === 'not_started') return ''
  if (status === 'no_record') return t('status.no_record', lang)
  return t(`status.${status}` as 'status.present', lang)
}

const cellFrame = CAL_CELL
const CELL_DOT: Partial<Record<Exclude<EmployeeCalendarCell['status'], null>, string>> = {
  present: 'bg-mint-deep',
  absent: 'bg-alert',
  on_leave: 'bg-sky',
  off: 'bg-line-strong',
}

/** This calendar's own day cell (calendar polish, map 013 follow-up): same
 *  cellFrame/DayNumber convention as the other two calendars' day cells
 *  (../../../attendance/employee/attendance-calendar.tsx,
 *  ../../../attendance/off-days/leave-calendar.tsx), but plain — one
 *  employee's own day never needs a Popover breakdown, so this stays a
 *  Server Component, not 'use client'. */
function EmployeeOwnDayCell({
  cell,
  lang,
  isToday,
  isWeekend,
}: {
  cell: EmployeeCalendarCell
  lang: Lang
  isToday: boolean
  isWeekend: boolean
}) {
  const weekendTint = isWeekend ? CAL_WEEKEND : ''

  if (!cell.iso || !cell.status) {
    return (
      <div className={`${cellFrame} ${cell.iso ? weekendTint : CAL_OUTSIDE}`} aria-hidden>
        <CalendarDayNumber label={localizeNumber(cell.day ?? 0, lang)} isToday={false} muted />
      </div>
    )
  }

  const quiet = cell.status === 'future' || cell.status === 'not_started'
  return (
    <div
      role="gridcell"
      aria-label={`${cell.iso} — ${cellStatusLabel(cell.status, lang)}`}
      aria-current={isToday ? 'date' : undefined}
      className={`${cellFrame} ${weekendTint} ${quiet ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center justify-between">
        <CalendarDayNumber label={localizeNumber(cell.day ?? 0, lang)} isToday={isToday} />
        {CELL_DOT[cell.status] && <span className={`size-2 rounded-full sm:hidden ${CELL_DOT[cell.status]}`} aria-hidden />}
      </div>
      {!quiet && (
        <span className={`hidden sm:block ${CAL_CHIP} ${CELL_TONE[cell.status]}`}>
          {cell.status === 'present' ? `${hhmm(cell.entry)}${cell.exit ? `–${hhmm(cell.exit)}` : ''}` || cellStatusLabel(cell.status, lang) : cellStatusLabel(cell.status, lang)}
        </span>
      )}
    </div>
  )
}

export interface EmployeeOwnAttendanceProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ month?: string }>
}

/** Shared by the full page (./page.tsx) and the Employees-list popup
 *  (@modal/(.)employees/[id]/attendance). `inModal` exists because the popup
 *  route intercepts every soft navigation to this path — including the full
 *  page's own ‹ › / Today `?month=` links, which used to open the popup over
 *  the page. So the full page's month links reload instead; the popup's stay
 *  client-side and re-render inside the popup. */
export async function EmployeeOwnAttendance({ params, searchParams, inModal }: EmployeeOwnAttendanceProps & { inModal: boolean }) {
  const { id } = await params
  const { month: monthParam } = await searchParams
  const lang: Lang = await currentLang()
  const { supabase, weeklyOffDays } = await getSchoolContext()

  const { data: employee } = await supabase
    .from('employee_card')
    .select('full_name, category')
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle()
  if (!employee) notFound()

  const today = schoolToday()
  const { year, month0 } = parseMonthParam(monthParam, today)
  const monthPrefix = `${year}-${String(month0 + 1).padStart(2, '0')}`
  const monthStart = `${monthPrefix}-01`
  const monthEnd = `${monthPrefix}-${String(new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()).padStart(2, '0')}`

  const [{ data: offDaysRaw }, { data: recordsRaw }, { data: approvedLeavesRaw }, { data: recentLeaves }, startById, { rows: schoolRecords, error: schoolRecordsError }] = await Promise.all([
    supabase.from('off_days').select('day, label, is_significant').gte('day', monthStart).lte('day', monthEnd),
    // One employee, one month: at most 31 rows — `.limit` keeps this bounded
    // per #546 even though the filter already pins it far under the cap.
    supabase
      .from('attendance_records')
      .select('att_date, entry_at, exit_at')
      .eq('person_type', 'employee')
      .eq('person_id', id)
      .gte('att_date', monthStart)
      .lte('att_date', monthEnd)
      .limit(31),
    supabase
      .from('employee_leaves')
      .select('from_day, to_day')
      .eq('employee_id', id)
      .eq('status', 'approved')
      .lte('from_day', monthEnd)
      .gte('to_day', monthStart),
    supabase
      .from('employee_leaves')
      .select('id, from_day, to_day, reason, status')
      .eq('employee_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
    // 0220's function (Owner and attendance-grant staff), else the Owner-only
    // table read; no entry just means no start clip.
    loadEmployeeAttendanceStarts(supabase, id),
    // Which days anyone in the School has a record: a day with none is "no
    // record", not "absent" (#694). Dates only.
    selectAllRows((from, to) =>
      supabase
        .from('attendance_records')
        .select('att_date')
        .eq('person_type', 'employee')
        .gte('att_date', monthStart)
        .lte('att_date', monthEnd)
        .range(from, to),
    ),
  ])

  const cells = buildEmployeeMonthCalendar({
    year,
    month0,
    today,
    offDays: offDaysRaw ?? [],
    weeklyOffDays,
    records: recordsRaw ?? [],
    approvedLeaves: approvedLeavesRaw ?? [],
    startDay: startById.get(id) ?? null,
    leaveBeatsOff: true,
    // A failed read would look like "no record" everywhere, so skip the state then.
    schoolRecordedDays: schoolRecordsError ? undefined : new Set(schoolRecords.map((r) => r.att_date as string)),
  })
  const summary = summarizeEmployeeMonth(cells)
  // #694: see the same check on the School's Employee Attendance page.
  const lastHeartbeat = await loadLastAgentHeartbeat(supabase)
  const agentNotSynced = cells.some((c) => c.status === 'no_record' && !!c.iso && agentNotSyncedFor(c.iso, lastHeartbeat))

  const prevHref = `?month=${shiftYearMonth(monthPrefix, -1)}`
  const nextHref = `?month=${shiftYearMonth(monthPrefix, 1)}`
  const todayHref = '?'
  const monthLabel = formatMonthYear(year, month0, lang)

  return (
    <div>
      <PageHeader
        title={employee.full_name}
        subtitle={employee.category ? employeeCategoryLabel(employee.category, lang) : undefined}
        crumbs={schoolCrumbs(
          '/school/employees',
          lang,
          { label: t('employees.title', lang), href: '/school/employees' },
          { label: t('employees.viewAttendance', lang) },
        )}
      />

      {agentNotSynced && lastHeartbeat && <AgentSyncWarning lastHeartbeat={lastHeartbeat} lang={lang} />}

      <section className="mb-grid rounded-2xl border border-line bg-paper p-card">
        <div className="mb-3">
          <CalendarToolbar monthLabel={monthLabel} prevHref={prevHref} nextHref={nextHref} todayHref={todayHref} lang={lang} reload={!inModal} />
        </div>

        <MonthGridFrame monthLabel={monthLabel} lang={lang} weeklyOffDays={weeklyOffDays}>
          {cells.map((cell, i) => (
            <EmployeeOwnDayCell
              key={cell.iso ?? `pad-${i}`}
              cell={cell}
              lang={lang}
              isToday={cell.iso === today}
              isWeekend={isWeekendColumn(i, weeklyOffDays)}
            />
          ))}
        </MonthGridFrame>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-mint-soft" /> {t('status.present', lang)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-alert-soft" /> {t('status.absent', lang)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-sky-soft" /> {t('status.on_leave', lang)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-paper-muted" /> {t('status.holiday', lang)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border border-line bg-paper" /> {t('status.no_record', lang)}
          </span>
        </div>
      </section>

      <StatGrid>
        <StatCard
          icon={<CalendarCheck />}
          tone="mint"
          label={t('attendance.presentRateCard', lang)}
          value={summary.rate !== null ? `${localizeNumber(summary.rate, lang)}%` : '—'}
        />
        <StatCard icon={<CalendarX />} tone="alert" label={t('attendance.absentDaysCard', lang)} value={localizeNumber(summary.absentDays, lang)} />
        <StatCard icon={<CalendarClock />} tone="sky" label={t('attendance.leaveDaysCard', lang)} value={localizeNumber(summary.leaveDays, lang)} />
      </StatGrid>

      <section className="rounded-2xl border border-line bg-paper p-card">
        <h3 className="mb-3 font-bold">{t('employees.leaveSectionTitle', lang)}</h3>
        {!recentLeaves?.length ? (
          <p className="text-sm text-muted">{t('employees.noLeaves', lang)}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {recentLeaves.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-semibold">
                    {formatDate(l.from_day, lang)} – {formatDate(l.to_day, lang)}
                  </p>
                  {l.reason && <p className="text-xs text-muted">{l.reason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <LeaveStatusPill status={l.status} lang={lang} />
                  {l.status === 'pending' && <LeaveActions kind="employee" id={l.id} lang={lang} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
