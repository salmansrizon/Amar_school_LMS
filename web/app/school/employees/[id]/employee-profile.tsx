import { cache } from 'react'
import { notFound } from 'next/navigation'
import {
  Banknote,
  Briefcase,
  Building,
  Calendar,
  CalendarDays,
  Clock,
  CreditCard,
  GraduationCap,
  Landmark,
  Phone,
  ScanLine,
  User,
} from 'lucide-react'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { isKnownAcademicShift, ACADEMIC_SHIFT_LABEL_KEY } from '@/lib/institute'
import { EntityAvatar } from '@/components/entity-avatar'
import { ProfileAside, ProfileField, ProfileSection } from '@/components/ui/profile'
import { OfficeTimeToggle, ShiftToggle } from '../employee-controls'
import { ProfileEditor } from './profile-controls'

// Editable employee profile, shared by the Employee detail page and the
// Employee list's record drawer (map 013, P3) — same split as StudentProfile.
// Container queries, not viewport breakpoints, so it fits both.
//
// No photo column on `employees` (unlike Student) — the aside gets a
// decorative initial tile instead of an upload control (honesty rule: don't
// invent an upload feature that has no backing storage/column).

/** One employees row per request, however many components ask. */
export const getEmployee = cache(async (id: string) => {
  const { supabase } = await getSchoolContext()
  const { data } = await supabase.from('employees').select('*').eq('id', id).maybeSingle()
  return data
})

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
  const dob = employee.date_of_birth ? new Date(employee.date_of_birth).toLocaleDateString(locale) : null
  const joiningDate = employee.joining_date ? new Date(employee.joining_date).toLocaleDateString(locale) : null

  return (
    <div className="@container">
      <div className="grid gap-4 @lg:grid-cols-[13rem_1fr]">
        <ProfileAside
          photo={
            <div className="mx-auto mb-3 flex aspect-square w-full max-w-44 items-center justify-center">
              <EntityAvatar name={employee.full_name} id={employee.id} size="xl" />
            </div>
          }
          facts={
            <>
              <ProfileField icon={User} label={t('employees.name', lang)} value={employee.full_name} />
              <ProfileField icon={Briefcase} label={t('employees.category', lang)} value={employee.category} />
              <ProfileField icon={Phone} label={t('employees.mobile', lang)} value={employee.mobile} />
            </>
          }
          highlight={
            <>
              {/* Read-only — unique_id is server-assigned and immutable (#564),
                  never editable via ProfileFields. */}
              <ProfileField icon={ScanLine} label={t('employees.uniqueId', lang)} value={employee.unique_id} />
              <ProfileField icon={CreditCard} label={t('employees.rfidCardNumber', lang)} value={employee.rfid_card_number} />
              <ProfileField icon={Calendar} label={t('employees.dob', lang)} value={dob} />
              <ProfileField icon={CalendarDays} label={t('employees.joiningDate', lang)} value={joiningDate} />
            </>
          }
        />

        <ProfileEditor lang={lang} employee={employee}>
          <ProfileSection icon={User} title={t('employees.identity', lang)} cols={3}>
            <ProfileField icon={User} label={t('employees.name', lang)} value={employee.full_name} />
            <ProfileField icon={Phone} label={t('employees.mobile', lang)} value={employee.mobile} />
            <ProfileField icon={Calendar} label={t('employees.dob', lang)} value={dob} />
            <ProfileField icon={CalendarDays} label={t('employees.joiningDate', lang)} value={joiningDate} />
            <ProfileField icon={ScanLine} label={t('employees.uniqueId', lang)} value={employee.unique_id} />
            <ProfileField icon={CreditCard} label={t('employees.rfidCardNumber', lang)} value={employee.rfid_card_number} />
          </ProfileSection>

          {configuredShifts.length > 0 && (
            <ProfileSection icon={Clock} title={t('employees.academicShifts', lang)} cols="flow">
              {configuredShifts.map((shift) => (
                <ShiftToggle
                  key={shift}
                  employeeId={id}
                  shift={shift}
                  label={t(ACADEMIC_SHIFT_LABEL_KEY[shift], lang)}
                  assigned={assignedShifts.has(shift)}
                />
              ))}
            </ProfileSection>
          )}

          <ProfileSection icon={Banknote} title={t('employees.bankInfo', lang)} cols={3}>
            <ProfileField icon={Banknote} label={t('employees.bankName', lang)} value={employee.bank_name} />
            <ProfileField icon={Landmark} label={t('employees.bankBranch', lang)} value={employee.bank_branch} />
            <ProfileField icon={CreditCard} label={t('employees.bankAccount', lang)} value={employee.bank_account} />
          </ProfileSection>

          <ProfileSection icon={Briefcase} title={t('employees.categoryQualification', lang)} cols={3}>
            <ProfileField icon={Briefcase} label={t('employees.category', lang)} value={employee.category} />
            <ProfileField icon={GraduationCap} label={t('employees.qualification', lang)} value={employee.qualification} />
            <ProfileField icon={Building} label={t('employees.department', lang)} value={employee.department} />
          </ProfileSection>

          <section className="mb-4 rounded-2xl border border-line bg-paper p-card">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
                <Clock className="size-4" aria-hidden />
              </span>
              <h3 className="font-bold">{t('employees.subjectOfficeTime', lang)}</h3>
            </div>
            <dl className="mb-3 grid gap-4 @md:grid-cols-2">
              <ProfileField label={t('employees.subjectTaught', lang)} value={employee.subject_taught} />
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
    </div>
  )
}
