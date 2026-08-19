import Form from 'next/form'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { dateRangeDays, studentLogDayStatus, type OffDay, type StudentLogDayStatus } from '@/lib/attendance-manual'
import { dateInputClass } from '@/components/ui/field'
import { PrintPage, InstituteHeader, PaginatedSheet, Badge } from '@/components/print/pieces'
import { PrintButton } from '@/components/print/print-button'
import { loadInstitutePrintHeader } from '@/lib/institute-print'

// Individual Student Log (map #380, docs/011_student_module.md): one
// student's attendance history, with Today / Monthly / Custom filters and
// print for the currently filtered view. Off-day/Saturday shading and the
// day-by-day range reuse dateRangeDays (shared with monthGrid's Saturday
// rule); day status reuses studentLogDayStatus, the four-state sibling of
// registerDayStatus. Print reuses the same PrintPage/InstituteHeader/
// PaginatedSheet/PrintButton seam every other printable in the app composes
// (ADR 0007) — no new print system.

type ViewMode = 'today' | 'month' | 'custom'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function currentMonthParam(): string {
  return todayIso().slice(0, 7) // YYYY-MM
}

function monthLabel(year: number, month: number, lang: Lang): string {
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

function dayLabel(iso: string, lang: Lang): string {
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { day: '2-digit', month: 'short', weekday: 'short' })
}

// Tones map onto the exact same colours the inline STATUS_BADGE className map
// used before this reused the shared Badge piece — present=success (mint),
// absent=alert, on_leave=info (sky), holiday=neutral.
const STATUS_TONE: Record<StudentLogDayStatus, 'success' | 'alert' | 'info' | 'neutral'> = {
  present: 'success',
  absent: 'alert',
  on_leave: 'info',
  holiday: 'neutral',
}

export default async function StudentLogDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>
  searchParams: Promise<{ class?: string; section?: string; view?: string; month?: string; from?: string; to?: string }>
}) {
  const { studentId } = await params
  const {
    class: className = '',
    section = '',
    view: viewParam,
    month: monthParam = currentMonthParam(),
    from: fromParam = '',
    to: toParam = '',
  } = await searchParams
  const view: ViewMode = viewParam === 'today' || viewParam === 'custom' ? viewParam : 'month'
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const [{ data: student }, institute] = await Promise.all([
    supabase.from('students').select('id, full_name, class_name, section, roll_number').eq('id', studentId).maybeSingle(),
    loadInstitutePrintHeader(supabase, lang),
  ])
  if (!student) notFound()

  const today = todayIso()
  const [yearStr, monthStr] = monthParam.split('-')
  const year = Number(yearStr) || new Date().getUTCFullYear()
  const month = (Number(monthStr) || 1) - 1 // 0-indexed
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthStart = `${monthPrefix}-01`
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const monthEnd = `${monthPrefix}-${String(daysInMonth).padStart(2, '0')}`

  const rangeStart = view === 'today' ? today : view === 'custom' ? fromParam : monthStart
  const rangeEnd = view === 'today' ? today : view === 'custom' ? toParam : monthEnd
  const rangeLabel =
    view === 'today'
      ? dayLabel(today, lang)
      : view === 'custom'
        ? fromParam && toParam
          ? `${dayLabel(fromParam, lang)} – ${dayLabel(toParam, lang)}`
          : ''
        : monthLabel(year, month, lang)

  const hasRange = !!rangeStart && !!rangeEnd && rangeStart <= rangeEnd

  const [{ data: offDaysRaw }, { data: recordsRaw }, { data: leavesRaw }] = await Promise.all([
    hasRange
      ? supabase.from('off_days').select('day, label, is_significant').gte('day', rangeStart).lte('day', rangeEnd)
      : Promise.resolve({ data: [] as OffDay[] }),
    hasRange
      ? supabase
          .from('attendance_records')
          .select('att_date')
          .eq('person_type', 'student')
          .eq('person_id', studentId)
          .gte('att_date', rangeStart)
          .lte('att_date', rangeEnd)
      : Promise.resolve({ data: [] as { att_date: string }[] }),
    hasRange
      ? supabase
          .from('student_leaves')
          .select('from_day, to_day')
          .eq('student_id', studentId)
          .eq('status', 'approved')
          .lte('from_day', rangeEnd)
          .gte('to_day', rangeStart)
      : Promise.resolve({ data: [] as { from_day: string; to_day: string }[] }),
  ])

  const offDays: OffDay[] = offDaysRaw ?? []
  const presentDates = new Set((recordsRaw ?? []).map((r) => r.att_date))
  const leaveRanges = leavesRaw ?? []
  const onApprovedLeave = (iso: string): boolean => leaveRanges.some((l) => iso >= l.from_day && iso <= l.to_day)

  const rows = dateRangeDays(rangeStart, rangeEnd, offDays)
    .map((cell) => ({
      iso: cell.iso,
      status: studentLogDayStatus({
        iso: cell.iso,
        today,
        isOff: cell.isOff,
        onApprovedLeave: onApprovedLeave(cell.iso),
        hasRecord: presentDates.has(cell.iso),
      }),
    }))
    .filter((row): row is { iso: string; status: StudentLogDayStatus } => row.status !== null)
    .reverse() // newest first

  const backHref = (() => {
    const p = new URLSearchParams()
    if (className) p.set('class', className)
    if (section) p.set('section', section)
    const q = p.toString()
    return `/school/attendance/student-log${q ? `?${q}` : ''}`
  })()

  const modeHref = (mode: ViewMode) => {
    const p = new URLSearchParams()
    if (className) p.set('class', className)
    if (section) p.set('section', section)
    p.set('view', mode)
    return `/school/attendance/student-log/${studentId}?${p.toString()}`
  }

  const pillClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold ${
      active ? 'border-brand-500 bg-brand-500 text-white' : 'border-line hover:bg-paper-muted'
    }`

  const docTitle = `${t('attendance.studentLogTitle', lang)} — ${student.full_name}${rangeLabel ? `, ${rangeLabel}` : ''}`

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-extrabold">{t('attendance.studentLogTitle', lang)}</h1>
        <Link
          href={backHref}
          aria-label={t('common.back', lang)}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex gap-2">
          <Link href={modeHref('today')} className={pillClass(view === 'today')}>
            {t('attendance.filterToday', lang)}
          </Link>
          <Link href={modeHref('month')} className={pillClass(view === 'month')}>
            {t('attendance.filterMonthly', lang)}
          </Link>
          <Link href={modeHref('custom')} className={pillClass(view === 'custom')}>
            {t('attendance.filterCustom', lang)}
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {view === 'month' && (
            <Form action={`/school/attendance/student-log/${studentId}`} className="flex items-center gap-2">
              <input type="hidden" name="class" value={className} />
              <input type="hidden" name="section" value={section} />
              <input type="hidden" name="view" value="month" />
              <input type="month" name="month" defaultValue={monthParam} className={dateInputClass()} />
              <button type="submit" className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted">
                {t('classes.filter', lang)}
              </button>
            </Form>
          )}

          {view === 'custom' && (
            <Form action={`/school/attendance/student-log/${studentId}`} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="class" value={className} />
              <input type="hidden" name="section" value={section} />
              <input type="hidden" name="view" value="custom" />
              <input type="date" name="from" defaultValue={fromParam} max={today} className={dateInputClass()} />
              <span className="text-sm text-muted">–</span>
              <input type="date" name="to" defaultValue={toParam} max={today} className={dateInputClass()} />
              <button type="submit" className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted">
                {t('classes.filter', lang)}
              </button>
            </Form>
          )}

          {!!rows.length && <PrintButton label={t('print.print', lang)} />}
        </div>
      </div>

      {!rows.length ? (
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card print:hidden">
          {t('attendance.none', lang)}
        </p>
      ) : (
        <PrintPage>
          <PaginatedSheet header={<InstituteHeader institute={institute ?? undefined} docTitle={docTitle} />}>
            <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-line bg-paper p-5 shadow-card sm:grid-cols-4 print:rounded-none print:border-0 print:p-0 print:shadow-none">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('attendance.nameCol', lang)}</div>
                <div className="text-sm font-semibold">{student.full_name}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('attendance.rollCol', lang)}</div>
                <div className="text-sm font-semibold">{student.roll_number ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('attendance.class', lang)}</div>
                <div className="text-sm font-semibold">{student.class_name ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('attendance.section', lang)}</div>
                <div className="text-sm font-semibold">{student.section ?? '—'}</div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-line bg-paper shadow-card print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-line-strong">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      {t('attendance.date', lang)}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      {t('attendance.leaveStatusCol', lang)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.iso} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 text-sm">{dayLabel(row.iso, lang)}</td>
                      <td className="px-3 py-2 text-sm">
                        <Badge tone={STATUS_TONE[row.status]}>{t(`status.${row.status}` as 'status.present', lang)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PaginatedSheet>
        </PrintPage>
      )}
    </main>
  )
}
