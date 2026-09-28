import Link from 'next/link'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { LoginLinkPicker, ShiftToggle } from '../employee-controls'
import { isKnownAcademicShift, ACADEMIC_SHIFT_LABEL_KEY } from '@/lib/institute'
import { ArchiveToggle, ProfileEditor } from './profile-controls'

// Layout per ui/school-owner/employee-detail.html: status header with
// Archive/Restore action, carded profile sections (Identity / Bank Info /
// Category & Qualification / Subject). Grace/Office-Time configuration moved
// to Attendance > Employees > Grace Time (issue #671, ADR 0030) — this page
// no longer shows any per-Employee grace breakdown.

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="text-sm">{value ?? <span className="text-muted">—</span>}</dd>
    </div>
  )
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-lg border border-line bg-paper p-5">
      <h3 className="mb-3 font-bold">{title}</h3>
      <dl className="grid gap-3 sm:grid-cols-2">{children}</dl>
    </section>
  )
}

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
  const { supabase, role, configuredShifts: rawConfiguredShifts } = await getSchoolContext()

  const { data: employee } = await supabase.from('employees').select('*').eq('id', id).single()
  if (!employee) notFound()

  const [{ data: logins }, { data: shiftAssignments }] = await Promise.all([
    // The Staff User logins this Employee could be linked to (#443). profiles
    // RLS only lets a School Owner list them, so this is empty for Staff.
    role === 'school_owner'
      ? supabase
          .from('profiles')
          .select('id, full_name')
          .eq('role', 'staff_user')
          .order('full_name')
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    supabase.from('employee_academic_shifts').select('employee_id, shift').eq('employee_id', id),
  ])

  const archived = employee.archived_at !== null
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const assignedShifts = new Set((shiftAssignments ?? []).map((a) => a.shift))
  const configuredShifts = rawConfiguredShifts.filter(isKnownAcademicShift)

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

      <ProfileEditor lang={lang} employee={employee}>
        <InfoCard title={t('employees.identity', lang)}>
          <InfoRow label={t('employees.name', lang)} value={employee.full_name} />
          <InfoRow label={t('employees.mobile', lang)} value={employee.mobile} />
          <InfoRow
            label={t('employees.dob', lang)}
            value={employee.date_of_birth ? new Date(employee.date_of_birth).toLocaleDateString(locale) : null}
          />
          <InfoRow
            label={t('employees.joiningDate', lang)}
            value={employee.joining_date ? new Date(employee.joining_date).toLocaleDateString(locale) : null}
          />
          {/* Read-only — unique_id is server-assigned and immutable (#564),
              never editable via ProfileFields. */}
          <InfoRow label={t('employees.uniqueId', lang)} value={employee.unique_id} />
          <InfoRow label={t('employees.rfidCardNumber', lang)} value={employee.rfid_card_number} />
        </InfoCard>

        {configuredShifts.length > 0 && (
          <section className="mb-4 rounded-lg border border-line bg-paper p-5">
            <h3 className="mb-3 font-bold">{t('employees.academicShifts', lang)}</h3>
            <div className="flex flex-wrap items-center gap-2">
              {configuredShifts.map((shift) => (
                <ShiftToggle
                  key={shift}
                  employeeId={id}
                  shift={shift}
                  label={t(ACADEMIC_SHIFT_LABEL_KEY[shift], lang)}
                  assigned={assignedShifts.has(shift)}
                />
              ))}
            </div>
          </section>
        )}

        <InfoCard title={t('employees.bankInfo', lang)}>
          <InfoRow label={t('employees.bankName', lang)} value={employee.bank_name} />
          <InfoRow label={t('employees.bankBranch', lang)} value={employee.bank_branch} />
          <InfoRow label={t('employees.bankAccount', lang)} value={employee.bank_account} />
        </InfoCard>

        <InfoCard title={t('employees.categoryQualification', lang)}>
          <InfoRow label={t('employees.category', lang)} value={employee.category} />
          <InfoRow label={t('employees.qualification', lang)} value={employee.qualification} />
          <InfoRow label={t('employees.department', lang)} value={employee.department} />
        </InfoCard>

        <InfoCard title={t('employees.subjectTitle', lang)}>
          <InfoRow label={t('employees.subjectTaught', lang)} value={employee.subject_taught} />
        </InfoCard>
      </ProfileEditor>
    </div>
  )
}
