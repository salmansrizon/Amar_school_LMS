import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { mergeLeaves, filterLeaves } from '@/lib/attendance-manual'
import { AttendanceTabs } from '../attendance-tabs'
import { LeaveActions, RequestLeaveForm } from './leave-controls'

// Layout per ui/school-owner/leave-management.html: search + type filter,
// unified Student/Employee leave table with Approve/Reject on pending rows.
const statusPill: Record<string, string> = {
  pending: 'bg-sun-soft text-sun-deep',
  approved: 'bg-mint-soft text-mint-deep',
  rejected: 'bg-alert-soft text-alert-deep',
}

export default async function LeaveManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>
}) {
  const { q = '', type = '' } = await searchParams
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: students }, { data: employees }, { data: studentLeaves }, { data: employeeLeaves }] =
    await Promise.all([
      supabase.from('students').select('id, full_name').order('full_name'),
      supabase.from('employees').select('id, full_name').order('full_name'),
      supabase
        .from('student_leaves')
        .select('id, student_id, from_day, to_day, reason, status, created_at')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('employee_leaves')
        .select('id, employee_id, from_day, to_day, reason, status, created_at')
        .order('created_at', { ascending: false })
        .limit(200),
    ])

  const studentNames = new Map((students ?? []).map((s) => [s.id, s.full_name]))
  const employeeNames = new Map((employees ?? []).map((e) => [e.id, e.full_name]))
  const merged = mergeLeaves(studentLeaves ?? [], employeeLeaves ?? [], studentNames, employeeNames)
  const visible = filterLeaves(merged, q, type)

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('attendance.leaveTitle', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>

      <AttendanceTabs active="/school/attendance/leave" lang={lang} />

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h3 className="mb-3 font-bold">{t('attendance.leaveRequestTitle', lang)}</h3>
        <RequestLeaveForm students={students ?? []} employees={employees ?? []} lang={lang} />
      </section>

      <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder={t('attendance.leaveSearch', lang)}
          className="w-56 rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
        />
        <select name="type" defaultValue={type} className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm">
          <option value="">{t('attendance.leaveAllTypes', lang)}</option>
          <option value="student">{t('attendance.leaveStudentType', lang)}</option>
          <option value="employee">{t('attendance.leaveEmployeeType', lang)}</option>
        </select>
        <button
          type="submit"
          className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('classes.filter', lang)}
        </button>
      </form>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        {!visible.length ? (
          <p className="text-sm text-muted">{t('attendance.none', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    {t('attendance.leaveName', lang)}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    {t('attendance.leaveTypeCol', lang)}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    {t('attendance.leaveFromCol', lang)}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    {t('attendance.leaveToCol', lang)}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    {t('attendance.leaveReasonCol', lang)}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    {t('attendance.leaveStatusCol', lang)}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted" />
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => (
                  <tr key={`${l.kind}-${l.id}`} className="border-b border-line">
                    <td className="px-3 py-2 text-sm font-medium">{l.name}</td>
                    <td className="px-3 py-2 text-sm">
                      {t(l.kind === 'student' ? 'attendance.leaveStudentType' : 'attendance.leaveEmployeeType', lang)}
                    </td>
                    <td className="px-3 py-2 text-sm">{l.fromDay}</td>
                    <td className="px-3 py-2 text-sm">{l.toDay}</td>
                    <td className="px-3 py-2 text-sm">{l.reason ?? <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2 text-sm">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusPill[l.status]}`}>
                        {t(
                          l.status === 'pending'
                            ? 'attendance.leavePending'
                            : l.status === 'approved'
                              ? 'attendance.leaveApproved'
                              : 'attendance.leaveRejected',
                          lang,
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {l.status === 'pending' && <LeaveActions kind={l.kind} id={l.id} lang={lang} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
