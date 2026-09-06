import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { PageHeader } from '@/components/ui/page'
import { AdmissionForm } from './admission-form'

// Layout per ui/school-owner/student-admission-form.html: carded sections
// Identity / Address / Guardian Info / Photo / Benefit Flags / Previous
// Institute / Sibling Info, Cancel + Save at the bottom. Roll shows the next
// roll (per School+class+section, by the school's increment) as a
// *placeholder*, not a submitted value — left blank, the field falls through
// to assign_student_roll's advisory-locked assignment, same as before this
// field existed; the operator can still type an explicit override (issue #503).

export default async function NewAdmissionPage() {
  const lang: Lang = await currentLang()
  const { supabase, schoolId, shiftSelection } = await getSchoolContext()

  const [{ data: classOfferings }, { data: enrollments }, { data: school }] = await Promise.all([
    applyGlobalShiftFilterToOfferings(
      supabase.from('class_offerings').select('id, name, section, group_department').order('created_at'),
      shiftSelection,
    ),
    // Same bounded whole-table read as the Class & Curriculum counts (ponytail:
    // fine up to 10k rows) — feeds the Roll Number field's next-roll suggestion.
    supabase.from('student_enrollments').select('class_offering_id, roll_number').limit(10000),
    supabase.from('schools').select('roll_number_increment').eq('id', schoolId).maybeSingle(),
  ])

  return (
    <>
      <PageHeader
        title={t('students.admissionTitle', lang)}
        backHref="/school/students"
        backLabel={t('students.listTitle', lang)}
      />
      <AdmissionForm
        lang={lang}
        classOfferings={classOfferings ?? []}
        enrollmentRolls={enrollments ?? []}
        rollIncrement={school?.roll_number_increment ?? 1}
      />
    </>
  )
}
