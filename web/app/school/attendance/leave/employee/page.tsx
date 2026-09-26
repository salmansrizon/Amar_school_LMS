import Form from 'next/form'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { AttendanceTabs } from '../../attendance-tabs'
import { RequestEmployeeLeaveForm, LeaveActions } from '../leave-controls'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { Pill } from '@/components/data-table/data-table'
import { PageHeader } from '@/components/ui/page'

// Split off the Employees half of the old unified Leave Management page (map
// #664). Employee search follows the same name-substring-over-the-full-roster
// pattern already used by Employee Attendance (app/school/attendance/employee/
// page.tsx) — `employee_card` is bounded by headcount, not a growth table —
// but the leave rows themselves are now scoped to the matched employees'
// ids in the query itself, not fetched with a flat cap and filtered after.
const STATUS_TONE: Record<string, 'sun' | 'mint' | 'alert'> = {
  pending: 'sun',
  approved: 'mint',
  rejected: 'alert',
}
const STATUS_KEY: Record<string, 'attendance.leavePending' | 'attendance.leaveApproved' | 'attendance.leaveRejected'> = {
  pending: 'attendance.leavePending',
  approved: 'attendance.leaveApproved',
  rejected: 'attendance.leaveRejected',
}

const DEFAULT_VIEW_LIMIT = 100
const FILTERED_VIEW_LIMIT = 500

interface EmployeeLeaveRow {
  id: string
  employee_id: string
  from_day: string
  to_day: string
  reason: string | null
  status: string
}

export default async function EmployeeLeaveManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: employees } = await supabase
    .from('employee_card')
    .select('id, full_name')
    .is('archived_at', null)
    .order('full_name')
  const allEmployees = employees ?? []

  const filterActive = Boolean(q.trim())
  const matched = filterActive
    ? allEmployees.filter((e) => e.full_name.toLowerCase().includes(q.trim().toLowerCase()))
    : allEmployees
  const matchedIds = matched.map((e) => e.id)

  let leaves: EmployeeLeaveRow[] = []
  if (filterActive) {
    if (matchedIds.length) {
      const { data } = await supabase
        .from('employee_leaves')
        .select('id, employee_id, from_day, to_day, reason, status')
        .in('employee_id', matchedIds)
        .order('from_day', { ascending: false })
        .limit(FILTERED_VIEW_LIMIT)
      leaves = data ?? []
    }
  } else {
    const { data } = await supabase
      .from('employee_leaves')
      .select('id, employee_id, from_day, to_day, reason, status')
      .order('created_at', { ascending: false })
      .limit(DEFAULT_VIEW_LIMIT)
    leaves = data ?? []
  }

  const nameById = new Map(allEmployees.map((e) => [e.id, e.full_name]))
  const rows = leaves.map((l) => ({ ...l, name: nameById.get(l.employee_id) ?? '—' }))

  const counts = leaves.reduce(
    (acc, l) => ({ ...acc, [l.status]: (acc[l.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  )

  return (
    <div>
      <PageHeader
        title={t('attendance.employeeLeaveTitle', lang)}
        crumbs={schoolCrumbs('/school/attendance', lang, { label: t('attendance.title', lang), href: '/school/attendance' }, { label: t('attendance.employeeLeaveTitle', lang) })}
      />

      <AttendanceTabs active="/school/attendance/leave/employee" lang={lang} />

      <section className="mb-grid rounded-2xl border border-line bg-paper p-card">
        <h3 className="mb-3 font-bold">{t('attendance.leaveRequestTitle', lang)}</h3>
        <RequestEmployeeLeaveForm employees={allEmployees} lang={lang} />
      </section>

      <Form className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-paper p-card" action="/school/attendance/leave/employee">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">{t('attendance.employeeSearch', lang)}</label>
          <input
            name="q"
            defaultValue={q}
            placeholder={t('attendance.employeeSearch', lang)}
            className="w-64 rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          className="h-9 cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('classes.filter', lang)}
        </button>
      </Form>

      {leaves.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t('attendance.leaveStatusSummary', lang)}:
          </span>
          {(['pending', 'approved', 'rejected'] as const).map(
            (status) =>
              counts[status] > 0 && (
                <Pill key={status} tone={STATUS_TONE[status]}>
                  {t(STATUS_KEY[status], lang)}: {counts[status]}
                </Pill>
              ),
          )}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-line bg-paper">
        {!rows.length ? (
          <p className="p-card text-sm text-muted">{t('attendance.none', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-paper-muted">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted">{t('attendance.leaveName', lang)}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted">{t('attendance.leaveFromCol', lang)}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted">{t('attendance.leaveToCol', lang)}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted">{t('attendance.leaveReasonCol', lang)}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted">{t('attendance.leaveStatusCol', lang)}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-3 text-sm font-medium">{l.name}</td>
                    <td className="px-4 py-3 text-sm">{l.from_day}</td>
                    <td className="px-4 py-3 text-sm">{l.to_day}</td>
                    <td className="px-4 py-3 text-sm">{l.reason ?? <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3 text-sm">
                      <Pill tone={STATUS_TONE[l.status]}>{t(STATUS_KEY[l.status], lang)}</Pill>
                    </td>
                    <td className="px-4 py-3 text-sm">{l.status === 'pending' && <LeaveActions kind="employee" id={l.id} lang={lang} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
