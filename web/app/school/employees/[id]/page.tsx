import Link from 'next/link'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { Crumbs } from '@/components/ui/page'
import { ProfileAvatar, ProfileHeader } from '@/components/ui/profile'
import { Pill } from '@/components/data-table/data-table'
import { LoginLinkPicker } from '../employee-controls'
import { ArchiveToggle } from './profile-controls'
import { EmployeeProfile, getEmployee } from './employee-profile'
import { employeeCategoryLabel } from '@/lib/employees'
import { disabledStaffLogins, staffLoginState } from '@/lib/staff-login'

// Profile sections live in employee-profile.tsx (shared with the list's drawer).
// Layout per ui/school-owner/employee-detail.html: status header with
// Archive/Restore action, carded profile sections (Identity / Bank Info /
// Category & Qualification / Subject). Grace/Office-Time configuration moved
// to Attendance > Employees > Grace Time (issue #671, ADR 0030) — this page
// no longer shows any per-Employee grace breakdown.

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; tab?: string }>
}) {
  const { id } = await params
  const { error: createError, tab } = await searchParams
  const lang: Lang = await currentLang()
  const { supabase, role } = await getSchoolContext()

  const employee = await getEmployee(id)
  if (!employee) notFound()

  // The Staff User logins this Employee could be linked to (#443). profiles
  // RLS only lets a School Owner list them, so this is empty for Staff.
  const { data: logins } =
    role === 'school_owner'
      ? await supabase.from('profiles').select('id, full_name').eq('role', 'staff_user').order('full_name')
      : { data: [] as { id: string; full_name: string | null }[] }

  const archived = employee.archived_at !== null
  // #688: the linked Staff login's state, for the Owner only (nobody else can
  // read it). 'unavailable' until migration 0241 is applied.
  const loginState =
    role === 'school_owner' && employee.profile_id
      ? staffLoginState(await disabledStaffLogins(supabase), employee.profile_id)
      : 'unavailable'

  return (
    <div>
      <Crumbs {...schoolCrumbs(
          '/school/employees',
          lang,
          { label: t('employees.title', lang), href: '/school/employees' },
          { label: employee.full_name },
        )} />

      {/* Carries a partial-creation failure (issue #566) across the redirect
          from the create form: the employee record exists, but a later step
          (login, or class assignment) didn't finish, and the Owner needs to
          see what to fix rather than land here with no explanation. */}
      {createError && (
        <p className="mb-4 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert-deep">{createError}</p>
      )}

      <ProfileHeader
        avatar={<ProfileAvatar />}
        name={employee.full_name}
        status={
          <Pill tone={archived ? 'muted' : 'mint'} live={!archived}>
            {t(archived ? 'employees.oldEmployee' : 'employees.active', lang)}
          </Pill>
        }
        meta={[
          employee.category ? `${t('employees.category', lang)}: ${employeeCategoryLabel(employee.category, lang)}` : null,
          employee.unique_id ? `${t('employees.uniqueId', lang)}: ${employee.unique_id}` : null,
        ]
          .filter(Boolean)
          .join('   |   ')}
        actions={<ArchiveToggle
            lang={lang}
            employeeId={id}
            archived={archived}
            staffLoginId={role === 'school_owner' ? employee.profile_id : null}
            loginState={loginState}
          />}
      />

      {role === 'school_owner' && (
        <section className="mb-4 rounded-lg border border-line bg-paper p-5">
          <h3 className="mb-3 font-bold">{t('employees.loginLink', lang)}</h3>
          {loginState === 'disabled' && employee.profile_id && (
            <p className="mb-3 rounded-md bg-sun-soft px-3 py-2 text-sm text-sun-deep">
              {t('staff.loginDisabledNote', lang)}{' '}
              <Link href={`/school/staff/${employee.profile_id}`} className="font-semibold underline">
                {t('employees.archiveLoginLink', lang)}
              </Link>
            </p>
          )}
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

      <EmployeeProfile id={id} lang={lang} tab={tab ?? 'general'} />
    </div>
  )
}
