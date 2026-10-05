import { CalendarDays, List as ListIcon, Grid3x3 } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { pageTitle } from '@/lib/page-title'
import { t, formatNumber, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { monthGrid, type OffDay } from '@/lib/attendance-manual'
import { schoolToday } from '@/lib/school-time'
import { parseMonthParam, shiftYearMonth, formatMonthYear, buildLeaveCalendarMonth, isWeekendColumn, buildOffDayList, formatDayLong, WEEKDAY_SHORT } from '@/lib/employee-attendance-calendar'
import { AttendanceTabs } from '../attendance-tabs'
import { CalendarToolbar, MonthGridFrame } from '../calendar-shell'
import { AddOffDayForm, DeleteOffDayButton, ImportCentralButton, WeeklyOffDayForm } from './off-day-controls'
import { LeaveCalendarDayCell } from './leave-calendar'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'

// Layout per ui/school-owner/off-day-calendar.html: 12-month grid shading
// off-days (red) and significant days (blue); the School's configured Weekly
// Off-Day weekdays (issue #665, ADR 0027) shade without needing a DB row per
// date (see monthGrid) — replacing the old hardcoded Saturday-only rule.
const MONTH_NAMES: { bn: string; en: string }[] = [
  { bn: 'জানুয়ারি', en: 'January' },
  { bn: 'ফেব্রুয়ারি', en: 'February' },
  { bn: 'মার্চ', en: 'March' },
  { bn: 'এপ্রিল', en: 'April' },
  { bn: 'মে', en: 'May' },
  { bn: 'জুন', en: 'June' },
  { bn: 'জুলাই', en: 'July' },
  { bn: 'আগস্ট', en: 'August' },
  { bn: 'সেপ্টেম্বর', en: 'September' },
  { bn: 'অক্টোবর', en: 'October' },
  { bn: 'নভেম্বর', en: 'November' },
  { bn: 'ডিসেম্বর', en: 'December' },
]
const WEEKDAY_LABELS: { bn: string; en: string }[] = [
  { bn: 'রবি', en: 'Su' },
  { bn: 'সোম', en: 'Mo' },
  { bn: 'মঙ্গল', en: 'Tu' },
  { bn: 'বুধ', en: 'We' },
  { bn: 'বৃহঃ', en: 'Th' },
  { bn: 'শুক্র', en: 'Fr' },
  { bn: 'শনি', en: 'Sa' },
]

function currentYear(): number {
  return new Date().getFullYear()
}

export const generateMetadata = pageTitle('attendance.offDayTitle')

export default async function OffDayCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; view?: string }>
}) {
  const { year: yearParam, month: monthParam, view } = await searchParams
  const year = Number(yearParam) || currentYear()
  const lang: Lang = await currentLang()
  const { supabase, weeklyOffDays, role } = await getSchoolContext()

  const { data: offDaysRaw } = await supabase
    .from('off_days')
    .select('day, label, is_significant')
    .gte('day', `${year}-01-01`)
    .lte('day', `${year}-12-31`)
    .order('day')
  const offDays: OffDay[] = offDaysRaw ?? []

  // Leave Calendar (map 013 follow-up): one active month, independent of the
  // year-scoped 12-month List above so switching one view never resets the
  // other's own navigation.
  const today = schoolToday()
  const { year: calYear, month0: calMonth0 } = parseMonthParam(monthParam, today)
  const calPrefix = `${calYear}-${String(calMonth0 + 1).padStart(2, '0')}`
  const calStart = `${calPrefix}-01`
  const calEnd = `${calPrefix}-${String(new Date(Date.UTC(calYear, calMonth0 + 1, 0)).getUTCDate()).padStart(2, '0')}`

  const [{ data: calOffDaysRaw }, { data: leaveRows }, { data: leaveEmployees }] = await Promise.all([
    supabase.from('off_days').select('day, label, is_significant').gte('day', calStart).lte('day', calEnd),
    supabase
      .from('employee_leaves')
      .select('employee_id, from_day, to_day, status')
      .in('status', ['approved', 'pending'])
      .lte('from_day', calEnd)
      .gte('to_day', calStart),
    supabase.from('employee_card').select('id, full_name').is('archived_at', null),
  ])
  const nameById = new Map((leaveEmployees ?? []).map((e) => [e.id, e.full_name]))
  const leaveCalendarCells = buildLeaveCalendarMonth({
    year: calYear,
    month0: calMonth0,
    offDays: calOffDaysRaw ?? [],
    weeklyOffDays,
    leaves: (leaveRows ?? []).map((l) => ({ ...l, employee_name: nameById.get(l.employee_id) ?? '—' })),
  })

  const listQuery = (extra: Record<string, string | undefined>) => {
    const qp = new URLSearchParams()
    if (yearParam) qp.set('year', yearParam)
    if (monthParam) qp.set('month', monthParam)
    for (const [k, v] of Object.entries(extra)) {
      if (v) qp.set(k, v)
      else qp.delete(k)
    }
    const qs = qp.toString()
    return qs ? `?${qs}` : '?'
  }
  const calendarHref = listQuery({ view: undefined })
  const listHref = listQuery({ view: 'list' })
  const isListView = view === 'list'
  const isHolidayView = view === 'holidays'
  const holidaysHref = listQuery({ view: 'holidays' })
  const { weekly: weeklyDays, rows: holidayRows } = buildOffDayList(offDays, weeklyOffDays, year)
  const calMonthLabel = formatMonthYear(calYear, calMonth0, lang)
  // Calendar view titles by the month on screen, not the list's ?year=.
  const titleYear = formatNumber(isListView || isHolidayView ? year : calYear, lang, { useGrouping: false })

  return (
    <div>
      <PageHeader
        title={`${t('attendance.offDayTitle', lang)} — ${titleYear}`}
        crumbs={schoolCrumbs('/school/attendance', lang, { label: t('attendance.title', lang), href: '/school/attendance' }, { label: `${t('attendance.offDayTitle', lang)} — ${titleYear}` })}
      />

      <AttendanceTabs
        active="/school/attendance/off-days"
        lang={lang}
        extra={
          <div className="flex flex-wrap items-center gap-2">
            {!isListView && !isHolidayView && (
              <CalendarToolbar
                monthLabel={calMonthLabel}
                prevHref={listQuery({ month: shiftYearMonth(calPrefix, -1) })}
                nextHref={listQuery({ month: shiftYearMonth(calPrefix, 1) })}
                todayHref={listQuery({ month: undefined })}
                lang={lang}
              />
            )}
            <SegmentedControl
              ariaLabel={t('attendance.viewSwitchLabel', lang)}
              active={isHolidayView ? holidaysHref : isListView ? listHref : calendarHref}
              items={[
                { href: calendarHref, label: t('attendance.viewCalendar', lang), icon: <CalendarDays className="size-4" />, iconOnlyOnMobile: true },
                { href: holidaysHref, label: t('attendance.viewHolidays', lang), icon: <ListIcon className="size-4" />, iconOnlyOnMobile: true },
                { href: listHref, label: t('attendance.viewList', lang), icon: <Grid3x3 className="size-4" />, iconOnlyOnMobile: true },
              ]}
            />
          </div>
        }
      />

      <section className="mb-grid rounded-2xl border border-line bg-paper p-card">
        <h3 className="mb-3 font-bold">{t('attendance.weeklyOffDayTitle', lang)}</h3>
        {role === 'school_owner' ? (
          <WeeklyOffDayForm value={weeklyOffDays} lang={lang} />
        ) : (
          <div className="text-sm text-muted">
            <p>
              {weeklyOffDays.length
                ? weeklyOffDays
                    .toSorted((a, b) => a - b)
                    .map((d) => WEEKDAY_LABELS[d][lang])
                    .join(', ')
                : t('attendance.none', lang)}
            </p>
            <p className="mt-1 text-xs">{t('attendance.weeklyOffDayOwnerOnly', lang)}</p>
          </div>
        )}
      </section>

      <section className="mb-grid rounded-2xl border border-line bg-paper p-card">
        <h3 className="mb-3 font-bold">{t('attendance.offDayAddTitle', lang)}</h3>
        <AddOffDayForm lang={lang} />
        <div className="mt-3 border-t border-line pt-3">
          <ImportCentralButton lang={lang} />
        </div>
      </section>

      {!isListView && !isHolidayView && (
        <section className="rounded-2xl border border-line bg-paper p-card">
          <MonthGridFrame monthLabel={calMonthLabel} lang={lang} weeklyOffDays={weeklyOffDays}>
            {leaveCalendarCells.map((cell, i) => (
              <LeaveCalendarDayCell
                key={cell.iso ?? `pad-${i}`}
                cell={cell}
                lang={lang}
                isToday={cell.iso === today}
                isWeekend={isWeekendColumn(i, weeklyOffDays)}
              />
            ))}
          </MonthGridFrame>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-alert-soft" /> {t('attendance.offDayLegendRegular', lang)}</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-sky-soft" /> {t('attendance.offDayLegendSignificant', lang)}</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-mint" /> {t('status.on_leave', lang)}</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border border-dashed border-sun-deep" /> {t('attendance.leavePending', lang)}</span>
          </div>
        </section>
      )}

      {isHolidayView && (
        <section className="rounded-2xl border border-line bg-paper p-card">
          <p className="mb-3 text-sm">
            <span className="font-semibold">{t('attendance.weeklyOffDayTitle', lang)}:</span>{' '}
            {weeklyDays.length ? weeklyDays.map((d) => WEEKDAY_SHORT[d][lang]).join(', ') : t('attendance.none', lang)}
          </p>
          {!holidayRows.length ? (
            <p className="text-sm text-muted">{t('attendance.none', lang)}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="py-2 pr-2 font-semibold">{t('attendance.offDayDate', lang)}</th>
                  <th className="py-2 pr-2 font-semibold">{t('attendance.offDayWeekdayCol', lang)}</th>
                  <th className="py-2 pr-2 font-semibold">{t('attendance.offDayLabelField', lang)}</th>
                  <th className="py-2 pr-2 font-semibold">{t('attendance.offDaySourceCol', lang)}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {holidayRows.map((r) => (
                  <tr key={r.iso} data-iso={r.iso}>
                    <td className="py-2 pr-2">{formatDayLong(r.iso, lang)}</td>
                    <td className="py-2 pr-2">{WEEKDAY_SHORT[r.weekday][lang]}</td>
                    <td className="py-2 pr-2 break-words">{r.label ?? '—'}</td>
                    <td className="py-2 pr-2">
                      {r.source === 'significant' ? t('attendance.offDayLegendSignificant', lang) : t('attendance.offDaySourceHoliday', lang)}
                    </td>
                    <td className="py-2"><DeleteOffDayButton day={r.iso} lang={lang} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {isListView && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-alert" /> {t('attendance.offDayLegendRegular', lang)}
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-sky" /> {t('attendance.offDayLegendSignificant', lang)}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MONTH_NAMES.map((name, month) => {
              const grid = monthGrid(year, month, offDays, weeklyOffDays)
              return (
                <div key={month} className="rounded-2xl border border-line bg-paper p-3">
                  <h4 className="mb-2 text-center text-sm font-bold">{name[lang]}</h4>
                  <div className="grid grid-cols-7 gap-0.5 text-xs">
                    {WEEKDAY_LABELS.map((w) => (
                      <span key={w.en} className="rounded-sm px-0.5 py-0.5 text-center text-muted">
                        {w[lang]}
                      </span>
                    ))}
                    {grid.map((cell, i) => (
                      <span
                        key={i}
                        title={cell.label ?? undefined}
                        className={`rounded-sm px-0.5 py-0.5 text-center ${
                          cell.isSignificant
                            ? 'bg-sky-soft font-semibold text-sky-deep'
                            : cell.isOff
                              ? 'bg-alert-soft font-semibold text-alert-deep'
                              : ''
                        }`}
                      >
                        {cell.day ?? ''}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <p className="mt-4 text-xs text-muted">{t('attendance.offDayWeeklyNote', lang)}</p>

          <section className="mt-6 rounded-2xl border border-line bg-paper p-card">
            {!offDays.length ? (
              <p className="text-sm text-muted">{t('attendance.none', lang)}</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {offDays.map((od) => (
                  <li key={od.day} className="flex items-center justify-between py-2">
                    <span>
                      {od.day}
                      {od.label ? ` — ${od.label}` : ''}
                      {od.is_significant && (
                        <span className="ml-2 rounded-full bg-sky-soft px-2 py-0.5 text-xs font-semibold text-sky-deep">
                          {t('attendance.offDayLegendSignificant', lang)}
                        </span>
                      )}
                    </span>
                    <DeleteOffDayButton day={od.day} lang={lang} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
