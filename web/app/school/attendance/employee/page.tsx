import Form from 'next/form'
import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { effectiveGraceWithSource, type GraceSource } from '@/lib/grace'
import { resolveEmployeeDisplayStatus, type EmployeeDisplayStatus } from '@/lib/attendance'
import { exemptionCategoriesByExemptionId } from '@/lib/school/ad-hoc-grace'
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

const GRACE_SOURCE_KEY: Record<GraceSource, 'attendance.graceSourceGlobal' | 'attendance.graceSourceCategory' | 'attendance.graceSourcePrayerTiffin' | 'attendance.graceSourceAdHoc'> = {
  global: 'attendance.graceSourceGlobal',
  category: 'attendance.graceSourceCategory',
  prayerTiffin: 'attendance.graceSourcePrayerTiffin',
  adHoc: 'attendance.graceSourceAdHoc',
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
  const { supabase, schoolId } = await getSchoolContext()

  const [{ data: school }, { data: employees }, { data: categories }, { data: adHocExemptions }] = await Promise.all([
    supabase.from('schools').select('default_grace_minutes').eq('id', schoolId).single(),
    supabase.from('employee_card').select('id, full_name, category').is('archived_at', null).order('full_name'),
    supabase.from('category_grace_minutes').select('category, grace_minutes, prayer_tiffin_minutes'),
    // Ad-Hoc Grace Exemptions active on this specific date (issue #671).
    supabase.from('ad_hoc_grace_exemptions').select('id, duration_minutes').eq('exemption_date', date),
  ])
  const categoriesByExemptionId = await exemptionCategoriesByExemptionId(
    supabase,
    (adHocExemptions ?? []).map((ex) => ex.id),
  )

  const roster = (employees ?? []).filter(
    (e) => !q.trim() || e.full_name.toLowerCase().includes(q.trim().toLowerCase()),
  )
  const employeeIds = roster.map((e) => e.id)

  const [{ data: records }, { data: leaves }] = await Promise.all([
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

  const graceByCategory = new Map(
    (categories ?? []).map((c) => [c.category, { grace: c.grace_minutes, prayerTiffin: c.prayer_tiffin_minutes }]),
  )
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

  const rows = roster.map((e) => {
    const categoryGrace = e.category ? graceByCategory.get(e.category) : undefined
    const { minutes: grace, source } = effectiveGraceWithSource({
      global: school?.default_grace_minutes ?? null,
      category: categoryGrace?.grace ?? null,
      prayerTiffin: categoryGrace?.prayerTiffin ?? null,
      adHoc: e.category ? (adHocByCategory.get(e.category) ?? null) : null,
    })

    const record = recordByEmployee.get(e.id)
    const status = resolveEmployeeDisplayStatus({
      hasRecord: !!record,
      onApprovedLeave: onLeaveEmployees.has(e.id),
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

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('attendance.employeeTitle', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <AttendanceTabs active="/school/attendance/employee" lang={lang} />

      <Form className="mb-4 flex flex-wrap items-center gap-2" action="/school/attendance/employee">
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
      </Form>

      <section className="mb-4 rounded-lg border border-line bg-paper p-5">
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

      <section className="rounded-lg border border-line bg-paper p-5">
        <p className="text-sm text-muted">{t('attendance.employeeGraceNote', lang)}</p>
        <p className="mt-2 text-sm text-muted">{t('attendance.employeeRfidNote', lang)}</p>
      </section>
    </div>
  )
}
