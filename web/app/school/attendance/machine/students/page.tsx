import Form from 'next/form'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { requireEmployeeAttendanceAdmin } from '@/lib/school/employee-attendance-admin'
import { schoolRoster } from '@/lib/school/roster-source'
import { classSectionLabel } from '@/lib/students'
import { enrollmentInfo, listMachines } from '@/lib/machine-enrollment-store'
import { ClassSectionSelect } from '@/components/ui/class-section-select'
import { AttendanceTabs } from '../../attendance-tabs'
import { MachinePageHeader } from '../page-header'
import { EnrollButton } from '../machine-ui'
import { RfidEntryTable, type RfidRow } from '../rfid-entry-table'
import { filterButtonClass, inputClass } from '@/components/ui/field'

// Student RFID Enrollment (issue #675). The roster is the same one Mark
// Attendance uses: the global Academic Year Selection narrows the students,
// the global Shift Selection narrows the class picker (the existing #579
// convention, kept on purpose), and this page adds its own Class filter and
// name search. Machine IDs are students.unique_id; cards come from
// machine_enroll_infos.

export default async function StudentRfidPage({
  searchParams,
}: {
  searchParams: Promise<{ classSection?: string; q?: string }>
}) {
  const { classSection = '', q = '' } = await searchParams
  const lang: Lang = await currentLang()
  const { supabase, shiftSelection, startedAcademicYears, academicYearSelection } = await getSchoolContext()
  // #677: Owner and office staff only; a teacher is refused.
  await requireEmployeeAttendanceAdmin('/school/attendance/machine/students')

  const [view, machines] = await Promise.all([
    schoolRoster(supabase, {
      classSection,
      q,
      shiftSelection,
      showYear: startedAcademicYears.length > 1,
      academicYearSelection,
    }),
    listMachines(supabase),
  ])
  const info = await enrollmentInfo(
    supabase,
    'student',
    view.students.map((s) => s.id),
  )
  const rows: RfidRow[] = view.students.map((s) => ({
    id: s.id,
    name: s.full_name,
    cells: [classSectionLabel(s.class_name, s.section) ?? '', s.roll_number == null ? '' : String(s.roll_number)],
    uniqueId: info.get(s.id)?.uniqueId ?? null,
    card: info.get(s.id)?.card ?? null,
  }))

  return (
    <div>
      <MachinePageHeader title={t('attendance.tabStudentRfid', lang)} lang={lang} />
      <AttendanceTabs active="/school/attendance/machine/students" lang={lang} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">{t('rfid.intro', lang)}</p>
        <EnrollButton kind="student" machines={machines} lang={lang} />
      </div>

      <Form
        action="/school/attendance/machine/students"
        className="mb-4 grid gap-3 rounded-lg border border-line bg-paper p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">{t('attendance.classSection', lang)}</label>
          <ClassSectionSelect
            combos={view.combos}
            value={classSection}
            ariaLabel={t('attendance.classSection', lang)}
            allLabel={t('attendance.allClasses', lang)}
            fullWidth
          />
        </div>
        <div>
          <label htmlFor="q" className="mb-1 block text-xs font-semibold text-muted">
            {t('rfid.name', lang)}
          </label>
          <input id="q" name="q" type="search" defaultValue={q} className={inputClass({ fullWidth: true })} />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className={filterButtonClass({ fullWidth: true })}
          >
            {t('classes.filter', lang)}
          </button>
        </div>
      </Form>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-paper p-6 text-center text-sm text-muted">
          {t('rfid.noStudents', lang)}
        </div>
      ) : (
        <RfidEntryTable
          // A new filter is a new list: start its inputs fresh.
          key={`${classSection}|${q}`}
          kind="student"
          rows={rows}
          headers={[t('rfid.class', lang), t('students.roll', lang)]}
          lang={lang}
        />
      )}
    </div>
  )
}
