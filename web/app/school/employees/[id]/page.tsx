import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { employeeShiftNames } from '@/lib/employees'
import { ShiftToggle } from '../employee-controls'
import { ArchiveToggle, ProfileEditor } from './profile-controls'

// Layout per ui/school-owner/employee-detail.html: status header with
// Archive/Restore action, carded profile sections (Identity / Bank Info /
// Category & Qualification / Subject & Shift), and the Office-Time &
// Considerable Grace Window breakdown table (max-across-levels rule, shipped
// in the MVP as issue #9) at the bottom.

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
    <section className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
      <h3 className="mb-3 font-bold">{title}</h3>
      <dl className="grid gap-3 sm:grid-cols-2">{children}</dl>
    </section>
  )
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', user.id)
    .single()
  if (!me?.school_id || (me.role !== 'school_owner' && me.role !== 'staff_user')) redirect('/login')

  const { data: employee } = await supabase.from('employees').select('*').eq('id', id).single()
  if (!employee) notFound()

  const [
    { data: school },
    { data: shifts },
    { data: assignments },
    { data: categories },
    { data: effective },
  ] = await Promise.all([
    supabase.from('schools').select('default_grace_minutes').eq('id', me.school_id).single(),
    supabase.from('shifts').select('id, name, grace_minutes').order('name'),
    supabase.from('employee_shifts').select('employee_id, shift_id').eq('employee_id', id),
    supabase.from('category_grace_minutes').select('category, grace_minutes').order('category'),
    supabase.rpc('effective_grace_minutes', { emp: id }),
  ])

  const archived = employee.archived_at !== null
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const assignedShiftIds = new Set((assignments ?? []).map((a) => a.shift_id))
  const shiftNames = employeeShiftNames(id, assignments ?? [], shifts ?? [])
  const categoryGrace = categories?.find((c) => c.category === employee.category)?.grace_minutes ?? null
  const shiftGrace = Math.max(
    0,
    ...(shifts ?? [])
      .filter((s) => assignedShiftIds.has(s.id))
      .map((s) => s.grace_minutes ?? 0),
  )
  const effectiveGrace = typeof effective === 'number' ? effective : 0
  const levels: { label: string; minutes: number | null }[] = [
    { label: t('grace.global', lang), minutes: school?.default_grace_minutes ?? null },
    { label: t('employees.gradeLevelCategory', lang), minutes: categoryGrace },
    { label: t('employees.gradeLevelShift', lang), minutes: shiftNames ? shiftGrace : null },
    { label: t('employees.override', lang), minutes: employee.grace_override_minutes },
  ]

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{employee.full_name}</h1>
        <Link href="/school/employees" className="text-sm text-brand-600 hover:underline">
          ← {t('employees.title', lang)}
        </Link>
      </div>

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
        </InfoCard>

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

        <section className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
          <h3 className="mb-3 font-bold">{t('employees.subjectShift', lang)}</h3>
          <dl className="mb-3 grid gap-3 sm:grid-cols-2">
            <InfoRow label={t('employees.subjectTaught', lang)} value={employee.subject_taught} />
          </dl>
          <p className="mb-2 text-xs font-semibold text-muted">{t('employees.shifts', lang)}</p>
          <div className="flex flex-wrap items-center gap-2">
            {!shifts?.length && <span className="text-sm text-muted">{t('employees.none', lang)}</span>}
            {shifts?.map((s) => (
              <ShiftToggle
                key={s.id}
                employeeId={id}
                shiftId={s.id}
                label={s.name}
                assigned={assignedShiftIds.has(s.id)}
              />
            ))}
          </div>
        </section>
      </ProfileEditor>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
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
                const winning = l.minutes !== null && l.minutes === effectiveGrace && effectiveGrace > 0
                return (
                  <tr key={l.label} className="border-b border-line">
                    <td className={`px-3 py-2 text-sm ${winning ? 'font-semibold' : ''}`}>{l.label}</td>
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
    </main>
  )
}
