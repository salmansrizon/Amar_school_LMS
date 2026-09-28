import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CalendarCheck, CalendarX, CalendarClock } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { employeeCategoryLabel } from '@/lib/employees'
import { schoolToday } from '@/lib/school-time'
import {
  parseMonthParam,
  shiftYearMonth,
  formatMonthYear,
  buildEmployeeMonthCalendar,
  summarizeEmployeeMonth,
  WEEKDAY_SHORT,
  type EmployeeCalendarCell,
} from '@/lib/employee-attendance-calendar'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { LeaveStatusPill } from '@/app/school/attendance/leave/leave-shared'
import { LeaveActions } from '@/app/school/attendance/leave/leave-controls'

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
}

function hhmm(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(11, 16)
}

function cellStatusLabel(status: Exclude<EmployeeCalendarCell['status'], null>, lang: Lang): string {
  if (status === 'off') return t('status.holiday', lang)
  if (status === 'future') return t('attendance.calendarUpcoming', lang)
  return t(`status.${status}` as 'status.present', lang)
}

export default async function EmployeeOwnAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ month?: string }>
}) {
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

  const [{ data: offDaysRaw }, { data: recordsRaw }, { data: approvedLeavesRaw }, { data: recentLeaves }] = await Promise.all([
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
  ])

  const cells = buildEmployeeMonthCalendar({
    year,
    month0,
    today,
    offDays: offDaysRaw ?? [],
    weeklyOffDays,
    records: recordsRaw ?? [],
    approvedLeaves: approvedLeavesRaw ?? [],
  })
  const summary = summarizeEmployeeMonth(cells)

  const prevHref = `?month=${shiftYearMonth(monthPrefix, -1)}`
  const nextHref = `?month=${shiftYearMonth(monthPrefix, 1)}`

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

      <section className="mb-grid rounded-2xl border border-line bg-paper p-card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link
            href={prevHref}
            scroll={false}
            aria-label={t('attendance.calendarPrevMonth', lang)}
            className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-paper-muted hover:text-ink"
          >
            ‹
          </Link>
          <h2 className="font-bold">{formatMonthYear(year, month0, lang)}</h2>
          <Link
            href={nextHref}
            scroll={false}
            aria-label={t('attendance.calendarNextMonth', lang)}
            className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-paper-muted hover:text-ink"
          >
            ›
          </Link>
        </div>

        <div role="grid" aria-label={formatMonthYear(year, month0, lang)} className="grid grid-cols-7 gap-1">
          {WEEKDAY_SHORT.map((w) => (
            <span key={w.en} role="columnheader" className="py-1 text-center text-xs font-semibold text-muted">
              {w[lang]}
            </span>
          ))}
          {cells.map((cell, i) =>
            cell.iso && cell.status ? (
              <div
                key={cell.iso}
                role="gridcell"
                aria-label={`${cell.iso} — ${cellStatusLabel(cell.status, lang)}`}
                className={`flex min-h-11 flex-col items-center justify-center rounded-lg px-0.5 py-1 text-center ${CELL_TONE[cell.status]}`}
              >
                <span className="text-xs font-semibold">{cell.day}</span>
                {cell.status === 'present' ? (
                  <span className="text-[10px] leading-tight">
                    {hhmm(cell.entry)}
                    {cell.exit ? `–${hhmm(cell.exit)}` : ''}
                  </span>
                ) : cell.status !== 'future' ? (
                  <span className="text-[10px] leading-tight">{cellStatusLabel(cell.status, lang)}</span>
                ) : null}
              </div>
            ) : (
              <div key={`blank-${i}`} aria-hidden />
            ),
          )}
        </div>
      </section>

      <StatGrid>
        <StatCard
          icon={<CalendarCheck />}
          tone="mint"
          label={t('attendance.presentRateCard', lang)}
          value={summary.rate !== null ? `${summary.rate}%` : '—'}
        />
        <StatCard icon={<CalendarX />} tone="alert" label={t('attendance.absentDaysCard', lang)} value={String(summary.absentDays)} />
        <StatCard icon={<CalendarClock />} tone="sky" label={t('attendance.leaveDaysCard', lang)} value={String(summary.leaveDays)} />
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
                    {l.from_day} – {l.to_day}
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
