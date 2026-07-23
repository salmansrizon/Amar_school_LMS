import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { effectiveGraceWithSource, type GraceSource } from '@/lib/grace'
import { resolveEmployeeDisplayStatus, type EmployeeDisplayStatus } from '@/lib/attendance'
import { AttendanceTabs } from '../attendance-tabs'
import { dateInputClass } from '@/components/ui/field'

// Layout per ui/school-owner/attendance-employee.html: search + date filter,
// one row per employee with In/Out/Status/Applied-Grace, the 6-state status
// badge set (4 on-time/late × on-time/early combos from reconcile_attendance,
// #10, plus Absent/On Leave — issue #30, PRD §5.3), and the MAX-across-levels
// grace note already shipped for individual employees (#9) generalized here.

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const STATUS_BADGE: Record<EmployeeDisplayStatus, string> = {
  on_time: 'bg-mint-soft text-mint-deep',
  exit_early: 'bg-sun-soft text-sun-deep',
  late_entry: 'bg-sun-soft text-sun-deep',
  late_exit_early: 'bg-alert-soft text-alert-deep',
  present: 'bg-mint-soft text-mint-deep',
  absent: 'bg-alert-soft text-alert-deep',
  on_leave: 'bg-sky-soft text-sky-deep',
}

const GRACE_SOURCE_KEY: Record<GraceSource, 'attendance.graceSourceGlobal' | 'attendance.graceSourceCategory' | 'attendance.graceSourceOfficeTime' | 'attendance.graceSourceOverride'> = {
  global: 'attendance.graceSourceGlobal',
  category: 'attendance.graceSourceCategory',
  officeTime: 'attendance.graceSourceOfficeTime',
  override: 'attendance.graceSourceOverride',
}

function hhmm(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toISOString().slice(11, 16)
}

export default async function EmployeeAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; date?: string }>
}) {
  const { q = '', date = todayIso() } = await searchParams
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role, school_id').eq('id', user.id).single()
  if (!me?.school_id || (me.role !== 'school_owner' && me.role !== 'staff_user')) redirect('/login')

  const [{ data: school }, { data: employees }, { data: officeTimes }, { data: categories }] = await Promise.all([
    supabase.from('schools').select('default_grace_minutes').eq('id', me.school_id).single(),
    supabase
      .from('employees')
      .select('id, full_name, category, grace_override_minutes')
      .is('archived_at', null)
      .order('full_name'),
    supabase.from('office_times').select('id, grace_minutes, starts_at, ends_at'),
    supabase.from('category_grace_minutes').select('category, grace_minutes'),
  ])

  const roster = (employees ?? []).filter(
    (e) => !q.trim() || e.full_name.toLowerCase().includes(q.trim().toLowerCase()),
  )
  const employeeIds = roster.map((e) => e.id)

  const [{ data: assignments }, { data: records }, { data: leaves }] = await Promise.all([
    employeeIds.length
      ? supabase.from('employee_office_times').select('employee_id, office_time_id').in('employee_id', employeeIds)
      : Promise.resolve({ data: [] as { employee_id: string; office_time_id: string }[] }),
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
  ])

  const categoryGraceByName = new Map((categories ?? []).map((c) => [c.category, c.grace_minutes]))
  const officeTimeById = new Map((officeTimes ?? []).map((s) => [s.id, s]))
  const officeTimeIdsByEmployee = new Map<string, string[]>()
  for (const a of assignments ?? []) {
    const list = officeTimeIdsByEmployee.get(a.employee_id) ?? []
    list.push(a.office_time_id)
    officeTimeIdsByEmployee.set(a.employee_id, list)
  }
  const recordByEmployee = new Map((records ?? []).map((r) => [r.person_id, r]))
  const onLeaveEmployees = new Set((leaves ?? []).map((l) => l.employee_id))

  const rows = roster.map((e) => {
    const assignedOfficeTimeIds = officeTimeIdsByEmployee.get(e.id) ?? []
    const assignedOfficeTimes = assignedOfficeTimeIds.map((id) => officeTimeById.get(id)).filter((s): s is NonNullable<typeof s> => !!s)
    const officeTimeGraces = assignedOfficeTimes.map((s) => s.grace_minutes).filter((g): g is number => g !== null && g !== undefined)
    const { minutes: grace, source } = effectiveGraceWithSource({
      global: school?.default_grace_minutes ?? null,
      category: e.category ? (categoryGraceByName.get(e.category) ?? null) : null,
      officeTimes: officeTimeGraces,
      override: e.grace_override_minutes,
    })
    // Multi-officeTime assignment mirrors reconcile_attendance's simplification
    // (migration 0017): earliest starts_at, latest ends_at across all
    // assigned officeTimes — not fixed here, out of scope for this ticket.
    const starts = assignedOfficeTimes.map((s) => s.starts_at).filter((v): v is string => !!v)
    const ends = assignedOfficeTimes.map((s) => s.ends_at).filter((v): v is string => !!v)
    const officeStart = starts.length ? starts.sort()[0] : null
    const officeEnd = ends.length ? ends.sort().slice(-1)[0] : null

    const record = recordByEmployee.get(e.id)
    const status = resolveEmployeeDisplayStatus({
      hasRecord: !!record,
      onApprovedLeave: onLeaveEmployees.has(e.id),
      entry: record ? new Date(record.entry_at) : null,
      exit: record?.exit_at ? new Date(record.exit_at) : null,
      officeStart,
      officeEnd,
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

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('attendance.employeeTitle', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <AttendanceTabs active="/school/attendance/employee" lang={lang} />

      <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder={t('attendance.employeeSearch', lang)}
          className="w-56 rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
        />
        <input type="date" name="date" defaultValue={date} className={dateInputClass()} />
        <button
          type="submit"
          className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('classes.filter', lang)}
        </button>
      </form>

      <section className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
        {!rows.length ? (
          <p className="text-sm text-muted">{t('attendance.noEmployees', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    {t('attendance.nameCol', lang)}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    {t('attendance.inCol', lang)}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    {t('attendance.outCol', lang)}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    {t('codes.status', lang)}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    {t('attendance.appliedGraceCol', lang)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line">
                    <td className="px-3 py-2 text-sm font-medium">{r.full_name}</td>
                    <td className="px-3 py-2 text-sm">{hhmm(r.entry)}</td>
                    <td className="px-3 py-2 text-sm">{hhmm(r.exit)}</td>
                    <td className="px-3 py-2 text-sm">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[r.status]}`}>
                        {t(`status.${r.status}` as 'status.on_time', lang)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {r.status === 'absent' || r.status === 'on_leave' ? (
                        '—'
                      ) : (
                        <>
                          {r.grace} {t('attendance.graceMinutesSuffix', lang)}
                          {r.graceSource && <> ({t(GRACE_SOURCE_KEY[r.graceSource], lang)})</>}
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

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <p className="text-sm text-muted">{t('attendance.employeeGraceNote', lang)}</p>
        <p className="mt-2 text-sm text-muted">{t('attendance.employeeRfidNote', lang)}</p>
      </section>
    </main>
  )
}
