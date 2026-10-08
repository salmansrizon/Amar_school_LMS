import { CalendarOff, CircleCheck, CircleX } from 'lucide-react'
import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, localeOf, numberFmt, formatDate } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { schoolToday } from '@/lib/school-time'
import { monthGrid, monthLeadIn, monthRange, shiftMonth, attendanceOutcome } from '@/lib/student/attendance'
import { classAttendanceDays } from '@/lib/student/attendance-source'
import { attendanceBand } from '@/lib/student/dashboard'
import { attendanceRange } from '@/lib/student/daily'
import { studentGroupTabs } from '@/lib/student-nav'
import { pageTitle } from '@/lib/page-title'
import { Icon } from '@/components/school-icons'
import { Card, PageHeader } from '@/components/ui/page'
import { SectionTabs } from '@/components/ui/section-tabs'
import { StatCard, StatGrid, WarningBanner } from '@/components/ui/widgets'
import { CAL_CELL, CAL_CHIP, CAL_OUTSIDE, CAL_WEEKEND, CalendarDayNumber, MonthGridFrame } from '@/app/school/attendance/calendar-shell'
import { isWeekendColumn } from '@/lib/employee-attendance-calendar'

// The Student's own attendance (#451).
//
// The percentage comes from student_absent_working_days — the caller-scoped
// wrapper over the same absent_working_days_in_range the absent-fine formula and
// the absence-SMS rules use. Counting attendance_records instead would disagree
// with the money, because that table only ever holds present-ish rows.
//
// Once migration 0218 is applied the page also knows which days attendance was
// taken for the class, and judges the Student on those (attendanceOutcome).
// Until then, and whenever that call gives nothing, it behaves as before.
export const generateMetadata = pageTitle('student.attendanceTitle')

export default async function StudentAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>
}) {
  const { y, m } = await searchParams
  const lang = await currentLang()
  const { supabase, student } = await getStudentContext()

  const today = schoolToday()
  const year = Number(y) || Number(today.slice(0, 4))
  const month = Number(m) || Number(today.slice(5, 7))
  const { start, end } = monthRange(year, month)
  // The month still running is counted up to today, as on the home: days that
  // have not happened yet are not absences. A past month runs to its last day.
  const counted = attendanceRange(start, end, today)

  const [records, leaves, schoolOff, centralOff, absent, school, takenDates] = await Promise.all([
    counted
      ? supabase.from('attendance_records').select('att_date').gte('att_date', counted.start).lte('att_date', counted.end)
      : Promise.resolve({ data: [] as { att_date: string }[] }),
    supabase.from('student_leaves').select('from_day, to_day').eq('status', 'approved'),
    supabase.from('off_days').select('day, label').gte('day', start).lte('day', end),
    supabase.from('central_off_days').select('day, label_bn, label_en').gte('day', start).lte('day', end),
    counted
      ? supabase.rpc('student_absent_working_days', { p_start: counted.start, p_end: counted.end })
      : Promise.resolve({ data: 0 }),
    // The weekly off-days only tint the weekend columns and mark those cells;
    // the counts above still come from the shared working-day rule.
    supabase.from('schools').select('weekly_off_days').eq('id', student.school_id).maybeSingle(),
    counted ? classAttendanceDays(supabase, counted.start, counted.end) : Promise.resolve(null),
  ])
  const weeklyOffDays: number[] = (school.data?.weekly_off_days as number[] | null) ?? []

  const presentDates = (records.data ?? []).map((r) => r.att_date as string)
  const offDays = [
    ...(centralOff.data ?? []).map((o) => ({
      day: o.day as string,
      label: (lang === 'bn' ? o.label_bn : o.label_en) ?? null,
    })),
    ...(schoolOff.data ?? []).map((o) => ({ day: o.day as string, label: o.label })),
  ]

  const num = numberFmt(lang, { useGrouping: false })
  const grid = monthGrid({
    year,
    month,
    presentDates,
    approvedLeaveRanges: leaves.data ?? [],
    offDays,
  })
  // With no present row and no taken day the school has not taken attendance;
  // 0% would accuse the student of something nobody recorded (same rule as the
  // home).
  const { percent, absentDays, absentDates } = attendanceOutcome({
    presentDates,
    takenDates,
    absentWorkingDays: typeof absent.data === 'number' ? absent.data : 0,
    today,
  })
  // Holidays plus the school's weekly off-days, the same cells the calendar
  // below marks as off.
  const firstColumn = monthLeadIn(year, month)
  const offCount = grid.filter(
    (d, i) => d.state === 'off' || (d.state === 'blank' && isWeekendColumn(firstColumn + i, weeklyOffDays)),
  ).length
  const fmt = (n: number) => num.format(n)

  const prev = shiftMonth(year, month, -1)
  const next = shiftMonth(year, month, 1)
  const locale = localeOf(lang)
  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const leadIn = monthLeadIn(year, month)
  // Day 0 of this month is the last day of the previous one.
  const prevMonthDays = new Date(Date.UTC(year, month - 1, 0)).getUTCDate()

  const tone: Record<string, string> = {
    present: 'bg-mint-soft text-mint-deep',
    leave: 'bg-sky-soft text-sky-deep',
    off: 'bg-paper-muted text-muted',
    absent: 'bg-alert-soft text-alert-deep',
    blank: 'bg-paper text-muted',
  }
  const dot: Record<string, string> = { present: 'bg-mint-deep', leave: 'bg-sky', off: 'bg-line-strong', absent: 'bg-alert-deep', blank: '' }
  const stateLabel: Record<string, string> = {
    present: t('student.present', lang),
    leave: t('student.onLeave', lang),
    off: t('student.offDay', lang),
    absent: t('student.attAbsent', lang),
    blank: '',
  }

  const chip =
    'inline-flex h-11 items-center rounded-full border border-line-strong px-4 text-sm font-semibold text-brand-600 hover:bg-paper-muted sm:h-9'

  return (
    <main className="w-full px-gutter pt-section pb-16">
      <PageHeader
        title={t('student.attendanceTitle', lang)}
        crumbs={{ lang, items: [{ label: t('student.nav.home', lang), href: '/student' }, { label: t('student.navGroup.attendance', lang) }] }}
        badge={monthLabel}
        actions={
          <>
            <Link href={`/student/attendance?y=${prev.year}&m=${prev.month}`} className={chip}>
              ← {t('student.prevMonth', lang)}
            </Link>
            <Link href={`/student/attendance?y=${next.year}&m=${next.month}`} className={chip}>
              {t('student.nextMonth', lang)} →
            </Link>
          </>
        }
      />
      <SectionTabs
        tabs={studentGroupTabs('attendance')}
        active="/student/attendance"
        lang={lang}
        label={t('student.navGroup.attendance', lang)}
      />

      {/* A month the school never took attendance for would read as a low rate
          and a run of absences; the figures are right (they agree with the fine
          formula) but the screen has to say what it is looking at. */}
      {percent === null && (
        <WarningBanner
          label={t('student.nav.attendance', lang)}
          text={t('student.attNoRecords', lang)}
          href="/student/leave"
          linkLabel={t('student.nav.leave', lang)}
        />
      )}

      <StatGrid>
        <StatCard
          icon={<Icon name="attendance" className="size-5" />}
          tone={attendanceBand(percent)}
          label={t('student.attendancePercent', lang)}
          value={percent === null ? '—' : `${fmt(percent)}%`}
          progress={percent ?? undefined}
        />
        <StatCard icon={<CircleCheck className="size-5" />} tone="mint" label={t('student.present', lang)} value={fmt(presentDates.length)} />
        <StatCard
          icon={<CircleX className="size-5" />}
          tone={absentDays && percent !== null ? attendanceBand(percent) : 'muted'}
          label={t('student.absentDays', lang)}
          // With no present row the school has not marked this month: the RPC's
          // count would read as absences nobody recorded.
          value={percent === null ? '—' : fmt(absentDays)}
        />
        <StatCard icon={<CalendarOff className="size-5" />} tone="sky" label={t('student.offDay', lang)} value={fmt(offCount)} />
      </StatGrid>

      <Card>
        {/* The owner's month grid (calendar-shell): bordered cells, weekday
            header, weekend columns tinted. Each cell: the date top-left (today
            in a filled circle) and the day's state as a chip; on a phone the
            chip shrinks to a dot and the state is in the cell's label. */}
        <MonthGridFrame monthLabel={monthLabel} lang={lang} weeklyOffDays={weeklyOffDays}>
          {Array.from({ length: leadIn }, (_, i) => (
            <div key={`lead-${i}`} aria-hidden className={`${CAL_CELL} ${CAL_OUTSIDE}`}>
              <CalendarDayNumber label={num.format(prevMonthDays - leadIn + i + 1)} isToday={false} muted />
            </div>
          ))}
          {grid.map((day, i) => {
            const weekend = isWeekendColumn(leadIn + i, weeklyOffDays)
            // A weekly off-day with no record reads as off, like a holiday.
            // A day the class was marked and this Student was not is absent
            // (only known once 0218 is applied; before that it stays blank).
            const state =
              day.state !== 'blank' ? day.state : weekend ? 'off' : absentDates.has(day.date) ? 'absent' : 'blank'
            const isToday = day.date === today
            const future = day.date > today
            const text = stateLabel[state]
            return (
              <div
                key={day.date}
                role="gridcell"
                aria-label={[formatDate(day.date, lang), text, day.label].filter(Boolean).join(', ')}
                aria-current={isToday ? 'date' : undefined}
                title={day.label ?? undefined}
                className={`${CAL_CELL} ${weekend ? CAL_WEEKEND : ''} ${future ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <CalendarDayNumber label={num.format(Number(day.date.slice(8)))} isToday={isToday} />
                  {text && <span className={`size-2 rounded-full sm:hidden ${dot[state]}`} aria-hidden />}
                </div>
                {text && (
                  <span className={`hidden sm:block ${CAL_CHIP} ${tone[state]}`}>
                    {day.label && state === 'off' ? day.label : text}
                  </span>
                )}
              </div>
            )
          })}
          {Array.from({ length: (7 - ((leadIn + grid.length) % 7)) % 7 }, (_, i) => (
            <div key={`tail-${i}`} aria-hidden className={`${CAL_CELL} ${CAL_OUTSIDE}`}>
              <CalendarDayNumber label={num.format(i + 1)} isToday={false} muted />
            </div>
          ))}
        </MonthGridFrame>

        <p className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
          <span className="rounded bg-mint-soft px-2 py-1 text-mint-deep">{t('student.present', lang)}</span>
          <span className="rounded bg-sky-soft px-2 py-1 text-sky-deep">{t('student.onLeave', lang)}</span>
          <span className="rounded bg-paper-muted px-2 py-1">{t('student.offDay', lang)}</span>
          {/* Blank is deliberately not "absent": a day nobody marked is not an
              absence (lib/student/attendance.ts). The absent count above comes
              from the shared working-day rule instead, so the legend says which
              colour is which rather than letting the empty cells imply it. */}
          <span className={`rounded px-2 py-1 ${absentDates.size ? tone.absent : 'border border-line'}`}>
            {t('student.attAbsent', lang)}
          </span>
        </p>
      </Card>
    </main>
  )
}
