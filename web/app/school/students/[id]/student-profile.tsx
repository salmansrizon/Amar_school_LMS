import { cache } from 'react'
import { notFound } from 'next/navigation'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { genderLabel, guardianRelationLabel, religionLabel } from '@/lib/students/stored-labels'
import { getSchoolContext } from '@/lib/school/context'
import { classSectionLabel } from '@/lib/students'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { applyGlobalYearFilterToOfferings } from '@/lib/school/year-filter'
import { PhotoControl, ProfileEditor } from './profile-controls'

// Photo + editable profile, shared by the Student detail page and the Student
// list's record drawer (map 013, F3). Container queries, not viewport
// breakpoints, so the same markup fits the full page and the drawer.

/** One students row per request, however many components ask. */
export const getStudent = cache(async (id: string) => {
  const { supabase } = await getSchoolContext()
  const { data } = await supabase.from('students').select('*').eq('id', id).maybeSingle()
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
      <dl className="grid gap-3 @md:grid-cols-2 @4xl:grid-cols-4">{children}</dl>
    </section>
  )
}

export async function StudentProfile({ id, lang }: { id: string; lang: Lang }) {
  const { supabase, shiftSelection, startedAcademicYears, academicYearSelection } = await getSchoolContext()
  const showYear = startedAcademicYears.length > 1
  const [student, { data: classes }] = await Promise.all([
    getStudent(id),
    applyGlobalYearFilterToOfferings(
      applyGlobalShiftFilterToOfferings(
        supabase
          .from('class_offerings')
          .select('id, name, section, group_department, shift, academic_year')
          .order('created_at'),
        shiftSelection,
      ),
      academicYearSelection,
    ),
  ])
  if (!student) notFound()

  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const flag = (on: boolean, onKey: MessageKey, offKey: MessageKey) => (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        on ? 'bg-sky-soft text-sky-deep' : 'bg-paper-muted text-muted'
      }`}
    >
      {t(on ? onKey : offKey, lang)}
    </span>
  )

  return (
        <div className="@container">
        <div className="mb-6 grid gap-4 @lg:grid-cols-[10rem_1fr]">
          <div className="rounded-lg border border-line bg-paper p-4 self-start">
            <PhotoControl lang={lang} studentId={id} hasPhoto={student.photo_path !== null} />
          </div>

          <ProfileEditor lang={lang} student={student} classes={classes ?? []} showYear={showYear}>
            <InfoCard title={t('students.identity', lang)}>
              <InfoRow label={t('students.name', lang)} value={student.full_name} />
              <InfoRow
                label={t('students.dob', lang)}
                value={
                  student.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString(locale) : null
                }
              />
              <InfoRow
                label={t('students.gender', lang)}
                value={genderLabel(student.gender, lang)}
              />
              <InfoRow label={t('students.bloodGroup', lang)} value={student.blood_group} />
              <InfoRow label={t('students.studentNo', lang)} value={student.student_no} />
              {/* Read-only — unique_id is server-assigned and immutable (#564),
                  never editable via ProfileFields. */}
              <InfoRow label={t('students.uniqueId', lang)} value={student.unique_id} />
              <InfoRow label={t('students.rfidCardNumber', lang)} value={student.rfid_card_number} />
              <InfoRow
                label={t('students.classSection', lang)}
                value={classSectionLabel(student.class_name, student.section)}
              />
              <InfoRow label={t('students.roll', lang)} value={student.roll_number} />
              <InfoRow label={t('students.religion', lang)} value={religionLabel(student.religion, lang)} />
              <InfoRow label={t('students.studentMobile', lang)} value={student.student_mobile} />
            </InfoCard>

            <InfoCard title={t('students.address', lang)}>
              <InfoRow label={t('students.address', lang)} value={student.address} />
            </InfoCard>

            <InfoCard title={t('students.guardianInfo', lang)}>
              <InfoRow label={t('students.guardianName', lang)} value={student.guardian_name} />
              <InfoRow
                label={t('students.relation', lang)}
                value={guardianRelationLabel(student.guardian_relation, lang)}
              />
              <InfoRow label={t('students.guardianMobile', lang)} value={student.guardian_mobile} />
              <InfoRow label={t('students.guardianNid', lang)} value={student.guardian_nid} />
            </InfoCard>

            <section className="mb-4 rounded-lg border border-line bg-paper p-5">
              <h3 className="mb-3 font-bold">{t('students.benefitFlags', lang)}</h3>
              <div className="flex flex-wrap gap-2">
                {flag(
                  student.is_freedom_fighter_child,
                  'students.freedomFighterChild',
                  'students.notFreedomFighterChild',
                )}
                {flag(student.is_indigenous, 'students.indigenous', 'students.notIndigenous')}
              </div>
            </section>

            <InfoCard title={t('students.previousInstitute', lang)}>
              <InfoRow label={t('students.previousInstituteName', lang)} value={student.previous_institute} />
              <InfoRow label={t('students.previousClass', lang)} value={student.previous_class} />
            </InfoCard>

            <InfoCard title={t('students.siblingInfo', lang)}>
              <InfoRow label={t('students.siblingDetails', lang)} value={student.sibling_info} />
            </InfoCard>
          </ProfileEditor>
        </div>
        </div>
  )
}
