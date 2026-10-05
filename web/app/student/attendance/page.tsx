import { CalendarOff, CircleCheck, CircleX } from 'lucide-react'
import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, localeOf, numberFmt } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { schoolToday } from '@/lib/school-time'
import { monthGrid, monthLeadIn, monthRange, shiftMonth, attendancePercent } from '@/lib/student/attendance'
import { attendanceBand } from '@/lib/student/dashboard'
import { attendanceRange } from '@/lib/student/daily'
import { studentGroupTabs } from '@/lib/student-nav'
import { pageTitle } from '@/lib/page-title'
import { Icon } from '@/components/school-icons'
import { Card, PageHeader } from '@/components/ui/page'
import { SectionTabs } from '@/components/ui/section-tabs'
import { StatCard, StatGrid, WarningBanner } from '@/components/ui/widgets'

// The Student's own attendance (#451).
//
// The percentage comes from student_absent_working_days — the caller-scoped
// wrapper over the same absent_working_days_in_range the absent-fine formula and
// the absence-SMS rules use. Counting attendance_records instead would disagree
// with the money, because that table only ever holds present-ish rows.
export const generateMetadata = pageTitle('student.attendanceTitle')

export default async function StudentAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>
}) {
  const { y, m } = await searchParams
  const lang = await currentLang()
  const { supabase } = await getStudentContext()

  const today = schoolToday()
  const year = Number(y) || Number(today.slice(0, 4))
  const month = Number(m) || Number(today.slice(5, 7))
  const { start, end } = monthRange(year, month)
  // The month still running is counted up to today, as on the home: days that
  // have not happened yet are not absences. A past month runs to its last day.
  const counted = attendanceRange(start, end, today)

  const [records, leaves, schoolOff, centralOff, absent] = await Promise.all([
    counted
      ? supabase.from('attendance_records').select('att_date').gte('att_date', counted.start).lte('att_date', counted.end)
      : Promise.resolve({ data: [] as { att_date: string }[] }),
    supabase.from('student_leaves').select('from_day, to_day').eq('status', 'approved'),
    supabase.from('off_days').select('day, label').gte('day', start).lte('day', end),
    supabase.from('central_off_days').select('day, label_bn, label_en').gte('day', start).lte('day', end),
    counted
      ? supabase.rpc('student_absent_working_days', { p_start: counted.start, p_end: counted.end })
      : Promise.resolve({ data: 0 }),
  ])

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
  const absentDays = typeof absent.data === 'number' ? absent.data : 0
  // With no present row the school has not taken attendance; 0% would accuse
  // the student of something nobody recorded (same rule as the home).
  const percent = presentDates.length ? attendancePercent(presentDates.length, absentDays) : null
  const offCount = grid.filter((d) => d.state === 'off').length
  const fmt = (n: number) => num.format(n)

  const prev = shiftMonth(year, month, -1)
  const next = shiftMonth(year, month, 1)
  const locale = localeOf(lang)
  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  // Sunday-start, to match the routine's রবি … বৃহঃ week. 2026-02-01 is a
  // Sunday and is only ever used to name the seven weekdays.
  const A_SUNDAY = Date.UTC(2026, 1, 1)
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(A_SUNDAY + i * 86_400_000).toLocaleDateString(locale, {
      weekday: 'short',
      timeZone: 'UTC',
    }),
  )
  const leadIn = monthLeadIn(year, month)

  const tone: Record<string, string> = {
    present: 'bg-mint-soft text-mint-deep',
    leave: 'bg-sky-soft text-sky-deep',
    off: 'bg-paper-muted text-muted',
    blank: 'bg-paper text-muted',
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
        <div className="grid grid-cols-7 gap-1">
          {weekdays.map((name) => (
            <div key={name} className="p-1 text-center text-[11px] font-semibold text-muted">
              {name}
            </div>
          ))}
          {Array.from({ length: leadIn }, (_, i) => (
            <div key={`lead-${i}`} aria-hidden />
          ))}
          {grid.map((day) => (
            <div
              key={day.date}
              title={day.label ?? undefined}
              className={`flex min-h-11 items-center justify-center rounded-md p-1 text-center text-xs ${tone[day.state]}`}
            >
              {num.format(Number(day.date.slice(8)))}
            </div>
          ))}
        </div>

        <p className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
          <span className="rounded bg-mint-soft px-2 py-1 text-mint-deep">{t('student.present', lang)}</span>
          <span className="rounded bg-sky-soft px-2 py-1 text-sky-deep">{t('student.onLeave', lang)}</span>
          <span className="rounded bg-paper-muted px-2 py-1">{t('student.offDay', lang)}</span>
          {/* Blank is deliberately not "absent": a day nobody marked is not an
              absence (lib/student/attendance.ts). The absent count above comes
              from the shared working-day rule instead, so the legend says which
              colour is which rather than letting the empty cells imply it. */}
          <span className="rounded border border-line px-2 py-1">{t('student.attAbsent', lang)}</span>
        </p>
      </Card>
    </main>
  )
}
