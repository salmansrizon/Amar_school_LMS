import Form from 'next/form'
import { CalendarDays, List } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { requireEmployeeAttendanceAdmin } from '@/lib/school/employee-attendance-admin'
import { effectiveGraceWithSource, isGraceDetail, GRACE_DETAIL_LABEL_KEY, type GraceSource, type StandingGraceCandidate } from '@/lib/grace'
import { resolveEmployeeDisplayStatus, type EmployeeDisplayStatus } from '@/lib/attendance'
import { schoolToday } from '@/lib/school-time'
import { isOffDayIso } from '@/lib/attendance-manual'
import { selectAllRows } from '@/lib/supabase/select-all'
import { parseMonthParam, shiftYearMonth, formatMonthYear, buildSchoolAttendanceMonth, isWeekendColumn, isNoRecordDay } from '@/lib/employee-attendance-calendar'
import { loadEmployeeAttendanceStarts } from '@/lib/school/employee-attendance-starts-source'
import { exemptionCategoriesByExemptionId } from '@/lib/school/ad-hoc-grace'
import { loadLastAgentHeartbeat, agentNotSyncedFor } from '@/lib/school/attendance-agent-sync'
import { AttendanceTabs } from '../attendance-tabs'
import { AgentSyncWarning } from '../agent-sync-warning'
import { CalendarToolbar, MonthGridFrame } from '../calendar-shell'
import { EmployeeAttendanceDayCell } from './attendance-calendar'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { dateInputClass, filterButtonClass, inputClass } from '@/components/ui/field'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { Pill } from '@/components/data-table/data-table'
import { pageTitle } from '@/lib/page-title'
import { DateField } from '@/components/ui/date-field'

// Layout per ui/school-owner/attendance-employee.html: search + date filter,
// one row per employee with In/Out/Status/Applied-Grace, the 6-state status
// badge set (4 on-time/late × on-time/early combos from reconcile_attendance,
// #10, plus Absent/On Leave — issue #30, PRD §5.3), and the MAX-across-levels
// grace note already shipped for individual employees (#9) generalized here.

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const STATUS_TONE: Record<EmployeeDisplayStatus, 'mint' | 'sun' | 'alert' | 'sky' | 'muted'> = {
  on_time: 'mint',
  exit_early: 'sun',
  late_entry: 'sun',
  late_exit_early: 'alert',
  present: 'mint',
  absent: 'alert',
  no_record: 'muted',
  on_leave: 'sky',
  holiday: 'sky',
}

// The winning rule's Grace Detail is the reason shown (issue #673), e.g.
// "30 min (Lunch Hour)"; an Ad-Hoc Grace Exemption reads as such.
function graceSourceLabel(source: GraceSource, lang: Lang): string {
  if (source.kind === 'adHoc') return t('attendance.graceSourceAdHoc', lang)
  return isGraceDetail(source.detail) ? t(GRACE_DETAIL_LABEL_KEY[source.detail], lang) : source.detail
}

function hhmm(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toISOString().slice(11, 16)
}

export const generateMetadata = pageTitle('attendance.employeeTitle')

export default async function EmployeeAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; date?: string; month?: string; view?: string }>
}) {
  const { q = '', date = todayIso(), month: monthParam, view } = await searchParams
  const lang: Lang = await currentLang()
  const { supabase, weeklyOffDays } = await getSchoolContext()
  // #677: Owner and office staff only; a teacher is refused.
  await requireEmployeeAttendanceAdmin('/school/attendance/employee')
  const isTableView = view === 'table'

  const [{ data: employees }, { data: standingRules }, { data: adHocExemptions }, { data: dateOffRows }, trackingStartById] = await Promise.all([
    supabase.from('employee_card').select('id, full_name, category').is('archived_at', null).order('full_name'),
    // Every Standing Grace Rule, any Shift — Shift is display-only (ADR 0032).
    supabase.from('standing_grace_rules').select('grace_detail, grace_minutes, standing_grace_rule_categories(category)'),
    // Ad-Hoc Grace Exemptions active on this specific date (issue #671).
    supabase.from('ad_hoc_grace_exemptions').select('id, duration_minutes').eq('exemption_date', date),
    supabase.from('off_days').select('day, label, is_significant').eq('day', date),
    // Start day per employee: 0220's function (Owner and attendance-grant
    // staff), else the Owner-only table read. Shared with the calendar below.
    loadEmployeeAttendanceStarts(supabase),
  ])
  const dateIsOff = isOffDayIso(date, dateOffRows ?? [], weeklyOffDays)
  const categoriesByExemptionId = await exemptionCategoriesByExemptionId(
    supabase,
    (adHocExemptions ?? []).map((ex) => ex.id),
  )

  const roster = (employees ?? []).filter(
    (e) => !q.trim() || e.full_name.toLowerCase().includes(q.trim().toLowerCase()),
  )
  const employeeIds = roster.map((e) => e.id)

  const [{ data: records }, { data: leaves }, { count: schoolRecordCount }] = await Promise.all([
    employeeIds.length
      ? supabase
          .from('attendance_records')
          .select('person_id, entry_at, exit_at')
          .eq('person_type', 'employee')
          .eq('att_date', date)
          .in('person_id', employeeIds)
      : Promise.resolve({ data: [] as { person_id: string; entry_at: string; exit_at: string | null }[] }),
    employeeIds.length
      ? supabase
          .from('employee_leaves')
          .select('employee_id, from_day, to_day')
          .eq('status', 'approved')
          .lte('from_day', date)
          .gte('to_day', date)
          .in('employee_id', employeeIds)
      : Promise.resolve({ data: [] as { employee_id: string; from_day: string; to_day: string }[] }),
    // School-wide (not the ?q= roster): "no record" means nobody was recorded.
    supabase
      .from('attendance_records')
      .select('id', { count: 'exact', head: true })
      .eq('person_type', 'employee')
      .eq('att_date', date),
  ])
  const noRecordDay = isNoRecordDay({ iso: date, today: schoolToday(), isOff: dateIsOff, recordCount: schoolRecordCount ?? 1 })

  const standingByCategory = new Map<string, StandingGraceCandidate[]>()
  for (const rule of standingRules ?? []) {
    for (const { category } of rule.standing_grace_rule_categories ?? []) {
      const list = standingByCategory.get(category) ?? []
      list.push({ detail: rule.grace_detail, minutes: rule.grace_minutes })
      standingByCategory.set(category, list)
    }
  }
  const durationByExemptionId = new Map((adHocExemptions ?? []).map((ex) => [ex.id, ex.duration_minutes]))
  const adHocByCategory = new Map<string, number>()
  for (const [exemptionId, categoriesForExemption] of categoriesByExemptionId) {
    const duration = durationByExemptionId.get(exemptionId) ?? 0
    for (const category of categoriesForExemption) {
      // At most one exemption per category per date in practice; MAX matches
      // this MAX-across-levels rule's own philosophy if it ever weren't.
      adHocByCategory.set(category, Math.max(adHocByCategory.get(category) ?? 0, duration))
    }
  }
  const recordByEmployee = new Map((records ?? []).map((r) => [r.person_id, r]))
  const onLeaveEmployees = new Set((leaves ?? []).map((l) => l.employee_id))

  // Someone who had not joined by this date is not absent on it (the calendar
  // already leaves those days blank); a real record still shows.
  const employedOnDate = roster.filter((e) => {
    const start = trackingStartById.get(e.id)
    return recordByEmployee.has(e.id) || !start || date >= start
  })
  const rows = employedOnDate.map((e) => {
    const { minutes: grace, source } = effectiveGraceWithSource({
      standing: e.category ? (standingByCategory.get(e.category) ?? []) : [],
      adHoc: e.category ? (adHocByCategory.get(e.category) ?? null) : null,
    })

    const record = recordByEmployee.get(e.id)
    const status = resolveEmployeeDisplayStatus({
      hasRecord: !!record,
      onApprovedLeave: onLeaveEmployees.has(e.id),
      isOff: dateIsOff,
      leaveBeatsOff: true,
      noRecordDay,
      entry: record ? new Date(record.entry_at) : null,
      exit: record?.exit_at ? new Date(record.exit_at) : null,
      // Office Time (the sole source of an expected start/end window) was
      // retired (issue #671, ADR 0030) with no replacement — every Employee
      // now reads 'present' rather than late/on-time/early whenever a record
      // exists, an accepted consequence since RFID (the only thing that ever
      // populated a real entry/exit time) is already disabled School-wide.
      officeStart: null,
      officeEnd: null,
      graceMinutes: grace,
    })

    return {
      id: e.id,
      full_name: e.full_name,
      entry: record?.entry_at ?? null,
      exit: record?.exit_at ?? null,
      status,
      grace,
      graceSource: source,
    }
  })

  // Employee Attendance Calendar (map 013 follow-up): one active month, every
  // employee (not the Table view's ?q= name filter — a whole-school day rate
  // has no meaning scoped to one name), independent of the Table's own ?date.
  // Only fetched for the view actually shown, same as the Table's own roster
  // query staying scoped to `date`.
  const today = schoolToday()
  const { year: calYear, month0: calMonth0 } = parseMonthParam(monthParam, today)
  const calPrefix = `${calYear}-${String(calMonth0 + 1).padStart(2, '0')}`
  const calStart = `${calPrefix}-01`
  const calEnd = `${calPrefix}-${String(new Date(Date.UTC(calYear, calMonth0 + 1, 0)).getUTCDate()).padStart(2, '0')}`

  const calendarCells = isTableView
    ? []
    : await (async () => {
        const [{ data: calOffDaysRaw }, { rows: calRecords }, { data: calApprovedLeaves }] = await Promise.all([
          supabase.from('off_days').select('day, label, is_significant').gte('day', calStart).lte('day', calEnd),
          selectAllRows((from, to) =>
            supabase
              .from('attendance_records')
              .select('person_id, att_date, entry_at')
              .eq('person_type', 'employee')
              .gte('att_date', calStart)
              .lte('att_date', calEnd)
              .range(from, to),
          ),
          supabase
            .from('employee_leaves')
            .select('employee_id, from_day, to_day')
            .eq('status', 'approved')
            .lte('from_day', calEnd)
            .gte('to_day', calStart),
        ])
        const startById = trackingStartById
        return buildSchoolAttendanceMonth({
          year: calYear,
          month0: calMonth0,
          today,
          offDays: calOffDaysRaw ?? [],
          weeklyOffDays,
          employees: (employees ?? []).map((e) => ({ ...e, startDay: startById.get(e.id) ?? null })),
          records: calRecords,
          approvedLeaves: calApprovedLeaves ?? [],
          markNoRecordDays: true,
        })
      })()

  const calQuery = (extra: Record<string, string | undefined>) => {
    const qp = new URLSearchParams()
    if (monthParam) qp.set('month', monthParam)
    for (const [k, v] of Object.entries(extra)) {
      if (v) qp.set(k, v)
      else qp.delete(k)
    }
    const qs = qp.toString()
    return qs ? `?${qs}` : '?'
  }
  // #694: a "no record" day after the Attendance Agent's last heartbeat may be
  // a sync failure, not an empty school. Null heartbeat = unknown = no warning.
  const lastHeartbeat = await loadLastAgentHeartbeat(supabase)
  const agentNotSynced = isTableView
    ? noRecordDay && agentNotSyncedFor(date, lastHeartbeat)
    : calendarCells.some((c) => c.noRecord && !!c.iso && agentNotSyncedFor(c.iso, lastHeartbeat))
  const calendarHref = calQuery({ view: undefined })
  const tableHref = calQuery({ view: 'table' })
  const monthLabel = formatMonthYear(calYear, calMonth0, lang)

  return (
    <div>
      <PageHeader
        title={t('attendance.employeeTitle', lang)}
        crumbs={schoolCrumbs('/school/attendance', lang, { label: t('attendance.title', lang), href: '/school/attendance' }, { label: t('attendance.employeeTitle', lang) })}
      />

      <AttendanceTabs
        active="/school/attendance/employee"
        lang={lang}
        extra={
          <div className="flex flex-wrap items-center gap-2">
            {!isTableView && (
              <CalendarToolbar
                monthLabel={monthLabel}
                prevHref={calQuery({ month: shiftYearMonth(calPrefix, -1) })}
                nextHref={calQuery({ month: shiftYearMonth(calPrefix, 1) })}
                todayHref={calQuery({ month: undefined })}
                lang={lang}
              />
            )}
            <SegmentedControl
              ariaLabel={t('attendance.viewSwitchLabel', lang)}
              active={isTableView ? tableHref : calendarHref}
              items={[
                { href: calendarHref, label: t('attendance.viewCalendar', lang), icon: <CalendarDays className="size-4" />, iconOnlyOnMobile: true },
                { href: tableHref, label: t('attendance.viewTable', lang), icon: <List className="size-4" />, iconOnlyOnMobile: true },
              ]}
            />
          </div>
        }
      />

      {agentNotSynced && lastHeartbeat && <AgentSyncWarning lastHeartbeat={lastHeartbeat} lang={lang} />}

      {!isTableView && (
        <section className="mb-4 rounded-2xl border border-line bg-paper p-card">
          <MonthGridFrame monthLabel={monthLabel} lang={lang} weeklyOffDays={weeklyOffDays}>
            {calendarCells.map((cell, i) => (
              <EmployeeAttendanceDayCell
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
        </section>
      )}

      {isTableView && (
      <>
      <Form className="mb-4 flex flex-wrap items-center gap-2" action="/school/attendance/employee">
        {/* Without it, Filter drops ?view and lands back on the Calendar view. */}
        <input type="hidden" name="view" value="table" />
        <input
          name="q"
          defaultValue={q}
          placeholder={t('attendance.employeeSearch', lang)}
          className={`${inputClass()} w-56`}
        />
        <DateField lang={lang} name="date" defaultValue={date} className={dateInputClass()} />
        <button
          type="submit"
          className={filterButtonClass()}
        >
          {t('classes.filter', lang)}
        </button>
      </Form>

      <section className="mb-4 overflow-hidden rounded-2xl border border-line bg-paper">
        {!rows.length ? (
          <p className="p-card text-sm text-muted">{t('attendance.noEmployees', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-paper-muted">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted">
                    {t('attendance.nameCol', lang)}
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted">
                    {t('attendance.inCol', lang)}
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted">
                    {t('attendance.outCol', lang)}
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted">
                    {t('codes.status', lang)}
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted">
                    {t('attendance.appliedGraceCol', lang)}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-sm font-medium">{r.full_name}</td>
                    <td className="px-4 py-3 text-sm">{hhmm(r.entry)}</td>
                    <td className="px-4 py-3 text-sm">{hhmm(r.exit)}</td>
                    <td className="px-4 py-3 text-sm">
                      <Pill tone={STATUS_TONE[r.status]}>{r.status === 'no_record' && date === today ? t('employees.notInYet', lang) : t(`status.${r.status}` as 'status.on_time', lang)}</Pill>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {r.status === 'absent' || r.status === 'on_leave' || r.status === 'holiday' || r.status === 'no_record' ? (
                        '—'
                      ) : (
                        <>
                          {r.grace} {t('attendance.graceMinutesSuffix', lang)}
                          {r.graceSource && <> ({graceSourceLabel(r.graceSource, lang)})</>}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-paper p-card">
        <p className="text-sm text-muted">{t('attendance.employeeGraceNote', lang)}</p>
        <p className="mt-2 text-sm text-muted">{t('attendance.employeeRfidNote', lang)}</p>
      </section>
      </>
      )}
    </div>
  )
}
