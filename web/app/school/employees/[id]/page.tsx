import Link from 'next/link'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { LoginLinkPicker } from '../employee-controls'
import { ArchiveToggle } from './profile-controls'
import { EmployeeProfile, getEmployee } from './employee-profile'
import { railClass } from '@/components/ui/page'

// Profile sections live in employee-profile.tsx (shared with the list's drawer).
// Layout per ui/school-owner/employee-detail.html: status header with
// Archive/Restore action, carded profile sections (Identity / Bank Info /
// Category & Qualification / Subject & OfficeTime), and the Office-Time &
// Considerable Grace Window breakdown table (max-across-levels rule, shipped
// in the MVP as issue #9) at the bottom.

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error: createError } = await searchParams
  const lang: Lang = await currentLang()
  const { supabase, schoolId, role } = await getSchoolContext()

  const employee = await getEmployee(id)
  if (!employee) notFound()

  const [
    { data: school },
    { data: officeTimes },
    { data: assignments },
    { data: categories },
    { data: effective },
    { data: logins },
  ] = await Promise.all([
    supabase.from('schools').select('default_grace_minutes').eq('id', schoolId).single(),
    supabase.from('office_times').select('id, name, grace_minutes').order('name'),
    supabase.from('employee_office_times').select('employee_id, office_time_id').eq('employee_id', id),
    supabase.from('category_grace_minutes').select('category, grace_minutes').order('category'),
    supabase.rpc('effective_grace_minutes', { emp: id }),
    // The Staff User logins this Employee could be linked to (#443). profiles
    // RLS only lets a School Owner list them, so this is empty for Staff.
    role === 'school_owner'
      ? supabase
          .from('profiles')
          .select('id, full_name')
          .eq('role', 'staff_user')
          .order('full_name')
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ])

  const archived = employee.archived_at !== null
  const assignedOfficeTimeIds = new Set((assignments ?? []).map((a) => a.office_time_id))
  const categoryGrace = categories?.find((c) => c.category === employee.category)?.grace_minutes ?? null
  // null unless at least one assigned officeTime has grace configured — an
  // assigned-but-unconfigured officeTime must read "—", the same as the other
  // unconfigured levels, not a misleading "0".
  const configuredOfficeTimeGraces = (officeTimes ?? [])
    .filter((s) => assignedOfficeTimeIds.has(s.id))
    .map((s) => s.grace_minutes)
    .filter((g): g is number => g !== null && g !== undefined)
  const officeTimeGrace = configuredOfficeTimeGraces.length ? Math.max(...configuredOfficeTimeGraces) : null
  const effectiveGrace = typeof effective === 'number' ? effective : 0
  const levels: { label: string; minutes: number | null }[] = [
    { label: t('grace.global', lang), minutes: school?.default_grace_minutes ?? null },
    { label: t('employees.gradeLevelCategory', lang), minutes: categoryGrace },
    { label: t('employees.gradeLevelOfficeTime', lang), minutes: officeTimeGrace },
    { label: t('employees.override', lang), minutes: employee.grace_override_minutes },
  ]

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{employee.full_name}</h1>
        <Link href="/school/employees" aria-label={t('employees.title', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      {/* Carries a partial-creation failure (issue #566) across the redirect
          from the create form: the employee record exists, but a later step
          (login, or class assignment) didn't finish, and the Owner needs to
          see what to fix rather than land here with no explanation. */}
      {createError && (
        <p className="mb-4 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert-deep">{createError}</p>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            archived ? 'bg-paper-muted text-muted' : 'bg-mint-soft text-mint-deep'
          }`}
        >
          {t(archived ? 'employees.oldEmployee' : 'employees.active', lang)}
        </span>
        <ArchiveToggle lang={lang} employeeId={id} archived={archived} />
      </div>

      {role === 'school_owner' && (
        <section className="mb-4 rounded-lg border border-line bg-paper p-5">
          <h3 className="mb-3 font-bold">{t('employees.loginLink', lang)}</h3>
          <div className="max-w-sm">
            <LoginLinkPicker
              lang={lang}
              employeeId={id}
              current={employee.profile_id}
              logins={logins ?? []}
            />
          </div>
        </section>
      )}

      <EmployeeProfile id={id} lang={lang} />

      <section className="rounded-lg border border-line bg-paper p-5">
        <h3 className="mb-2 font-bold">{t('employees.graceWindowTitle', lang)}</h3>
        <p className="mb-3 text-sm text-muted">{t('grace.hint', lang)}</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line-strong">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  {t('employees.gradeLevel', lang)}
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  {t('employees.graceMinutes', lang)}
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted" />
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => {
                // Highlight every configured level tied with the effective value — including
                // when every applicable level is 0, which is still a legitimate MAX result.
                const winning = l.minutes !== null && l.minutes === effectiveGrace
                return (
                  <tr key={l.label} className="border-b border-line">
                    <td className={`px-3 py-2 text-sm ${winning ? 'font-semibold' : ''} ${railClass(winning ? 'sky' : 'muted')}`}>{l.label}</td>
                    <td className="px-3 py-2 text-sm">
                      {l.minutes ?? <span className="text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {winning && (
                        <span className="rounded-full bg-sky-soft px-2 py-0.5 text-xs font-semibold text-sky-deep">
                          {t('employees.winningValue', lang)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          {t('employees.effective', lang)}: {effectiveGrace}m
        </p>
      </section>
    </div>
  )
}
