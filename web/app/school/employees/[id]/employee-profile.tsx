import { cache } from 'react'
import { notFound } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { isKnownAcademicShift, ACADEMIC_SHIFT_LABEL_KEY } from '@/lib/institute'
import { employeeCategoryLabel } from '@/lib/employees'
import { OfficeTimeToggle, ShiftToggle } from '../employee-controls'
import { ProfileEditor } from './profile-controls'

// Editable employee profile, shared by the Employee detail page and the
// Employee list's record drawer (map 013, P3) — same split as StudentProfile.
// Container queries, not viewport breakpoints, so it fits both.

/** One employees row per request, however many components ask. */
export const getEmployee = cache(async (id: string) => {
  const { supabase } = await getSchoolContext()
  const { data } = await supabase.from('employees').select('*').eq('id', id).maybeSingle()
  return data
})

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
      <dl className="grid gap-3 @md:grid-cols-2 @4xl:grid-cols-3">{children}</dl>
    </section>
  )
}

export async function EmployeeProfile({ id, lang }: { id: string; lang: Lang }) {
  const { supabase, configuredShifts: rawConfiguredShifts } = await getSchoolContext()
  const [employee, { data: officeTimes }, { data: assignments }, { data: shiftAssignments }] = await Promise.all([
    getEmployee(id),
    supabase.from('office_times').select('id, name').order('name'),
    supabase.from('employee_office_times').select('office_time_id').eq('employee_id', id),
    supabase.from('employee_academic_shifts').select('shift').eq('employee_id', id),
  ])
  if (!employee) notFound()

  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const assignedOfficeTimeIds = new Set((assignments ?? []).map((a) => a.office_time_id))
  const assignedShifts = new Set((shiftAssignments ?? []).map((a) => a.shift))
  const configuredShifts = rawConfiguredShifts.filter(isKnownAcademicShift)

  return (
    <div className="@container">
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
          <InfoRow
            label={t('employees.category', lang)}
            value={employee.category ? employeeCategoryLabel(employee.category, lang) : null}
          />
          <InfoRow label={t('employees.qualification', lang)} value={employee.qualification} />
          <InfoRow label={t('employees.department', lang)} value={employee.department} />
        </InfoCard>

        <section className="mb-4 rounded-lg border border-line bg-paper p-5">
          <h3 className="mb-3 font-bold">{t('employees.subjectOfficeTime', lang)}</h3>
          <dl className="mb-3 grid gap-3 @md:grid-cols-2">
            <InfoRow label={t('employees.subjectTaught', lang)} value={employee.subject_taught} />
          </dl>
          <p className="mb-2 text-xs font-semibold text-muted">{t('employees.officeTimes', lang)}</p>
          <div className="flex flex-wrap items-center gap-2">
            {!officeTimes?.length && <span className="text-sm text-muted">{t('employees.none', lang)}</span>}
            {officeTimes?.map((s) => (
              <OfficeTimeToggle
                key={s.id}
                employeeId={id}
                officeTimeId={s.id}
                label={s.name}
                assigned={assignedOfficeTimeIds.has(s.id)}
              />
            ))}
          </div>
        </section>
      </ProfileEditor>
    </div>
  )
}
