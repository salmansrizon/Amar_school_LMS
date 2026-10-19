import { cache } from 'react'
import { notFound } from 'next/navigation'
import {
  Building2,
  Calendar,
  CreditCard,
  Droplet,
  Flag,
  GraduationCap,
  Hash,
  Home,
  IdCard,
  Landmark,
  Link2,
  MapPin,
  Phone,
  ScanLine,
  User,
  UserPlus,
  Users,
  VenusAndMars,
} from 'lucide-react'
import { t, type Lang, type MessageKey, formatDate } from '@/lib/i18n'
import { genderLabel, guardianRelationLabel, religionLabel } from '@/lib/students/stored-labels'
import { getSchoolContext } from '@/lib/school/context'
import { studentClassLabel } from '@/lib/students'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { applyGlobalYearFilterToOfferings } from '@/lib/school/year-filter'
import { ProfileAside, ProfileField, ProfileGrid, ProfileSection, ProfileTabsCard } from '@/components/ui/profile'
import { DocArt, FamilyArt, MapArt, SchoolArt, SiblingsArt } from '@/components/ui/profile-art'
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

export const STUDENT_TABS = [
  { key: 'general', labelKey: 'profile.tab.general' },
  { key: 'academic', labelKey: 'profile.tab.academic' },
  { key: 'guardian', labelKey: 'students.guardianInfo' },
  { key: 'contact', labelKey: 'profile.tab.contact' },
  { key: 'notes', labelKey: 'profile.tab.notes' },
] as const

/** `tab` set (the detail page): a tab row, one tab's content, and `extras` for
 *  the sections that live on the page (subjects, login, behaviour log). Unset
 *  (the list's drawer): no tabs, the General content only. */
export async function StudentProfile({
  id,
  lang,
  tab,
  extras,
}: {
  id: string
  lang: Lang
  tab?: string
  extras?: { academic?: React.ReactNode; guardian?: React.ReactNode; notes?: React.ReactNode }
}) {
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

  const dob = student.date_of_birth ? formatDate(student.date_of_birth, lang) : null
  const classSection = studentClassLabel(student.class_name, student.section)
  const flag = (on: boolean, onKey: MessageKey, offKey: MessageKey) => (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        on ? 'bg-sky-soft text-sky-deep' : 'bg-paper-muted text-muted'
      }`}
    >
      {t(on ? onKey : offKey, lang)}
    </span>
  )

  const empty = (...v: unknown[]) => v.every((x) => x === null || x === undefined || x === '')
  const guardianFields = (
    <>
      <ProfileField icon={Users} label={t('students.guardianName', lang)} value={student.guardian_name} />
      <ProfileField icon={Link2} label={t('students.relation', lang)} value={guardianRelationLabel(student.guardian_relation, lang)} />
      <ProfileField icon={Phone} label={t('students.guardianMobile', lang)} value={student.guardian_mobile} />
      <ProfileField icon={CreditCard} label={t('students.guardianNid', lang)} value={student.guardian_nid} />
    </>
  )
  const guardianEmpty = empty(student.guardian_name, student.guardian_relation, student.guardian_mobile, student.guardian_nid)
  const general = (
    <>
      <ProfileSection icon={User} title={t('students.studentInfo', lang)} cols={2}>
        <ProfileField icon={User} label={t('students.name', lang)} value={student.full_name} />
        <ProfileField icon={Calendar} label={t('students.dob', lang)} value={dob} />
        <ProfileField icon={VenusAndMars} label={t('students.gender', lang)} value={genderLabel(student.gender, lang)} />
        <ProfileField icon={Droplet} label={t('students.bloodGroup', lang)} value={student.blood_group} />
        <ProfileField icon={IdCard} label={t('students.studentNo', lang)} value={student.student_no} />
        <ProfileField icon={ScanLine} label={t('students.uniqueId', lang)} value={student.unique_id} />
        <ProfileField icon={GraduationCap} label={t('students.classSection', lang)} value={classSection} />
        <ProfileField icon={Hash} label={t('students.roll', lang)} value={student.roll_number} />
        <ProfileField icon={Landmark} label={t('students.religion', lang)} value={religionLabel(student.religion, lang)} />
        <ProfileField icon={Phone} label={t('students.studentMobile', lang)} value={student.student_mobile} />
      </ProfileSection>
      <ProfileGrid>
        <ProfileSection icon={Home} title={t('students.address', lang)} cols={2} art={<MapArt />} empty={empty(student.address)} lang={lang}>
          <ProfileField icon={MapPin} label={t('students.address', lang)} value={student.address} />
        </ProfileSection>
        <ProfileSection icon={Users} title={t('students.guardianInfo', lang)} cols={2} art={<FamilyArt />} empty={guardianEmpty} lang={lang}>
          {guardianFields}
        </ProfileSection>
        <ProfileSection icon={Flag} title={t('students.benefitFlags', lang)} cols="flow" art={<DocArt />}>
          {flag(student.is_freedom_fighter_child, 'students.freedomFighterChild', 'students.notFreedomFighterChild')}
          {flag(student.is_indigenous, 'students.indigenous', 'students.notIndigenous')}
        </ProfileSection>
        <ProfileSection icon={Building2} title={t('students.previousInstitute', lang)} cols={2} art={<SchoolArt />} empty={empty(student.previous_institute, student.previous_class)} lang={lang}>
          <ProfileField icon={Building2} label={t('students.previousInstituteName', lang)} value={student.previous_institute} />
          <ProfileField icon={GraduationCap} label={t('students.previousClass', lang)} value={student.previous_class} />
        </ProfileSection>
        <ProfileSection icon={UserPlus} title={t('students.siblingInfo', lang)} cols={2} art={<SiblingsArt />} empty={empty(student.sibling_info)} lang={lang}>
          <ProfileField icon={UserPlus} label={t('students.siblingDetails', lang)} value={student.sibling_info} />
        </ProfileSection>
      </ProfileGrid>
    </>
  )
  const active = STUDENT_TABS.find((x) => x.key === tab)?.key ?? 'general'
  const body =
    active === 'academic' ? (
      <>
        <ProfileSection icon={GraduationCap} title={t('profile.tab.academic', lang)} cols={2}>
          <ProfileField icon={GraduationCap} label={t('students.classSection', lang)} value={classSection} />
          <ProfileField icon={Hash} label={t('students.roll', lang)} value={student.roll_number} />
          <ProfileField icon={IdCard} label={t('students.studentNo', lang)} value={student.student_no} />
        </ProfileSection>
        {extras?.academic}
      </>
    ) : active === 'guardian' ? (
      <>
        <ProfileSection icon={Users} title={t('students.guardianInfo', lang)} cols={2} art={<FamilyArt />}>
          {guardianFields}
        </ProfileSection>
        {extras?.guardian}
      </>
    ) : active === 'contact' ? (
      <ProfileSection icon={Phone} title={t('profile.tab.contact', lang)} cols={2}>
        <ProfileField icon={Phone} label={t('students.studentMobile', lang)} value={student.student_mobile} />
        <ProfileField icon={Phone} label={t('students.guardianMobile', lang)} value={student.guardian_mobile} />
        <ProfileField icon={MapPin} label={t('students.address', lang)} value={student.address} />
      </ProfileSection>
    ) : active === 'notes' ? (
      extras?.notes
    ) : (
      general
    )

  return (
    <div className="@container mb-6">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @2xl:grid-cols-[18rem_minmax(0,1fr)]">
        <ProfileAside
          photo={<PhotoControl lang={lang} studentId={id} hasPhoto={student.photo_path !== null} />}
          facts={
            <>
              <ProfileField icon={User} label={t('students.name', lang)} value={student.full_name} />
              <ProfileField icon={GraduationCap} label={t('students.classSection', lang)} value={classSection} />
              <ProfileField icon={Hash} label={t('students.roll', lang)} value={student.roll_number} />
            </>
          }
          highlight={
            <>
              <ProfileField icon={IdCard} label={t('students.studentNo', lang)} value={student.student_no} />
              {/* Read-only — unique_id is server-assigned and immutable (#564),
                  never editable via ProfileFields. */}
              <ProfileField icon={ScanLine} label={t('students.uniqueId', lang)} value={student.unique_id} />
              <ProfileField icon={Calendar} label={t('students.dob', lang)} value={dob} />
            </>
          }
          more={
            <>
              <ProfileField icon={VenusAndMars} label={t('students.gender', lang)} value={genderLabel(student.gender, lang)} />
              <ProfileField icon={Landmark} label={t('students.religion', lang)} value={religionLabel(student.religion, lang)} />
              <ProfileField icon={Droplet} label={t('students.bloodGroup', lang)} value={student.blood_group} />
            </>
          }
        />

        <ProfileEditor lang={lang} student={student} classes={classes ?? []} showYear={showYear}>
          {tab === undefined ? general : <ProfileTabsCard tabs={STUDENT_TABS} active={active} lang={lang} label={t('profile.tabsLabel', lang)}>{body}</ProfileTabsCard>}
        </ProfileEditor>
      </div>
    </div>
  )
}
