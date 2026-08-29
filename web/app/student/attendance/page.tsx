import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, localeOf, numberFmt } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { schoolToday } from '@/lib/school-time'
import { monthGrid, monthLeadIn, monthRange, shiftMonth, attendancePercent } from '@/lib/student/attendance'
import { pageTitle } from '@/lib/student/metadata'

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

  const [records, leaves, schoolOff, centralOff, absent] = await Promise.all([
    supabase.from('attendance_records').select('att_date').gte('att_date', start).lte('att_date', end),
    supabase.from('student_leaves').select('from_day, to_day').eq('status', 'approved'),
    supabase.from('off_days').select('day, label').gte('day', start).lte('day', end),
    supabase.from('central_off_days').select('day, label_bn, label_en').gte('day', start).lte('day', end),
    supabase.rpc('student_absent_working_days', { p_start: start, p_end: end }),
  ])

  const presentDates = (records.data ?? []).map((r) => r.att_date as string)
  const offDays = [
    ...(centralOff.data ?? []).map((o) => ({
      day: o.day as string,
      label: (lang === 'bn' ? o.label_bn : o.label_en) ?? null,
    })),
    ...(schoolOff.data ?? []).map((o) => ({ day: o.day as string, label: o.label })),
  ]

  const grid = monthGrid({
    year,
    month,
    presentDates,
    approvedLeaveRanges: leaves.data ?? [],
    offDays,
  })
  const absentDays = typeof absent.data === 'number' ? absent.data : 0
  const percent = attendancePercent(presentDates.length, absentDays)

  const prev = shiftMonth(year, month, -1)
  const next = shiftMonth(year, month, 1)
  const locale = localeOf(lang)
  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const num = numberFmt(lang, { useGrouping: false })
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

  return (
    <main className="w-full max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-extrabold">{t('student.attendanceTitle', lang)}</h1>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-line bg-paper p-4">
          <div className="text-xl font-extrabold text-brand-700">{percent === null ? '—' : `${num.format(percent)}%`}</div>
          <div className="text-xs text-muted">{t('student.attendancePercent', lang)}</div>
        </div>
        <div className="rounded-lg border border-line bg-paper p-4">
          <div className="text-xl font-extrabold">{num.format(presentDates.length)}</div>
          <div className="text-xs text-muted">{t('student.present', lang)}</div>
        </div>
        <div className="rounded-lg border border-line bg-paper p-4">
          <div className="text-xl font-extrabold">{num.format(absentDays)}</div>
          <div className="text-xs text-muted">{t('student.absentDays', lang)}</div>
        </div>
      </div>

      {/* A month the school never took attendance for reads as 3% and "30 absent
          days" otherwise — the figures are right (they agree with the fine
          formula) but the screen has to say what it is looking at. */}
      {percent === null || presentDates.length === 0 ? (
        <p className="mb-3 rounded-lg border border-line bg-paper-muted p-3 text-xs text-muted">
          {t('student.attNoRecords', lang)}
        </p>
      ) : null}

      <div className="mb-3 flex items-center justify-between">
        <Link href={`/student/attendance?y=${prev.year}&m=${prev.month}`} className="text-sm text-brand-600 hover:underline">
          ← {t('student.prevMonth', lang)}
        </Link>
        <span className="font-semibold">{monthLabel}</span>
        <Link href={`/student/attendance?y=${next.year}&m=${next.month}`} className="text-sm text-brand-600 hover:underline">
          {t('student.nextMonth', lang)} →
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1 rounded-lg border border-line bg-paper p-3">
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
            className={`rounded-md p-2 text-center text-xs ${tone[day.state]}`}
          >
            {num.format(Number(day.date.slice(8)))}
          </div>
        ))}
      </div>

      <p className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
        <span className="rounded bg-mint-soft px-2 text-mint-deep">{t('student.present', lang)}</span>
        <span className="rounded bg-sky-soft px-2 text-sky-deep">{t('student.onLeave', lang)}</span>
        <span className="rounded bg-paper-muted px-2">{t('student.offDay', lang)}</span>
        {/* Blank is deliberately not "absent": a day nobody marked is not an
            absence (lib/student/attendance.ts). The absent count above comes
            from the shared working-day rule instead, so the legend says which
            colour is which rather than letting the empty cells imply it. */}
        <span className="rounded border border-line px-2">{t('student.attAbsent', lang)}</span>
      </p>
    </main>
  )
}
