import { Pager, paginate, pageSizeFrom } from '@/components/pager'
import Form from 'next/form'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { requireEmployeeAttendanceAdmin } from '@/lib/school/employee-attendance-admin'
import { ACADEMIC_SHIFT_LABEL_KEY, isKnownAcademicShift } from '@/lib/institute'
import { EMPLOYEE_CATEGORIES, EMPLOYEE_CATEGORY_LABEL_KEY } from '@/lib/employees'
import { employeeShifts, enrollmentInfo, listMachines } from '@/lib/machine-enrollment-store'
import { filterEmployeesByShift, NO_SHIFT_FILTER as NO_SHIFT } from '@/lib/machine-attendance'
import { selectClass, filterButtonClass } from '@/components/ui/field'
import { AttendanceTabs } from '../../attendance-tabs'
import { MachinePageHeader } from '../page-header'
import { EnrollButton } from '../machine-ui'
import { RfidEntryTable, type RfidRow } from '../rfid-entry-table'

// Employee Enrollment (issue #675). Employees are read through employee_card
// (0136), which 0213 extended with unique_id, so an Attendance-grant Staff
// User sees Machine IDs without reaching bank details. The Shift filter uses
// employee_academic_shifts (an employee may work several Shifts) and only
// offers the School's configured Shifts.

function categoryLabel(category: string | null, lang: Lang): string {
  if (!category) return ''
  const known = (EMPLOYEE_CATEGORIES as readonly string[]).includes(category)
  return known ? t(EMPLOYEE_CATEGORY_LABEL_KEY[category as (typeof EMPLOYEE_CATEGORIES)[number]], lang) : category
}

function shiftLabel(shift: string, lang: Lang): string {
  return isKnownAcademicShift(shift) ? t(ACADEMIC_SHIFT_LABEL_KEY[shift], lang) : shift
}

export default async function EmployeeEnrollmentPage({
  searchParams,
}: {
  searchParams: Promise<{ shift?: string; page?: string; size?: string }>
}) {
  const params = await searchParams
  const { shift: requested = '' } = params
  const lang: Lang = await currentLang()
  const { supabase, configuredShifts } = await getSchoolContext()
  // #677: Owner and office staff only; a teacher is refused.
  await requireEmployeeAttendanceAdmin('/school/attendance/machine/employees')
  // An unknown or no-longer-configured Shift in the URL falls back to all.
  const shift = requested === NO_SHIFT || configuredShifts.includes(requested) ? requested : ''

  const [{ data: employees }, machines] = await Promise.all([
    supabase.from('employee_card').select('id, full_name, category').is('archived_at', null).order('full_name'),
    listMachines(supabase),
  ])
  const all = (employees ?? []) as { id: string; full_name: string; category: string | null }[]
  const ids = all.map((e) => e.id)
  const [shifts, info] = await Promise.all([employeeShifts(supabase, ids), enrollmentInfo(supabase, 'employee', ids)])

  const visible = filterEmployeesByShift(all, shifts, shift)
  const pageSize = pageSizeFrom(params.size, 20)
  const pageData = paginate(visible, params.page, pageSize)
  const rows: RfidRow[] = pageData.items.map((e) => ({
    id: e.id,
    name: e.full_name,
    cells: [
      categoryLabel(e.category, lang),
      ...(configuredShifts.length ? [(shifts.get(e.id) ?? []).map((s) => shiftLabel(s, lang)).join(', ')] : []),
    ],
    uniqueId: info.get(e.id)?.uniqueId ?? null,
    card: info.get(e.id)?.card ?? null,
  }))

  return (
    <div>
      <MachinePageHeader title={t('attendance.tabEmployeeEnrollment', lang)} lang={lang} />
      <AttendanceTabs active="/school/attendance/machine/employees" lang={lang} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">{t('rfid.intro', lang)}</p>
        <EnrollButton kind="employee" machines={machines} lang={lang} />
      </div>

      {configuredShifts.length > 0 && (
        <Form
          action="/school/attendance/machine/employees"
          className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-paper p-4"
        >
          <div>
            <label htmlFor="shift" className="mb-1 block text-xs font-semibold text-muted">
              {t('rfid.shift', lang)}
            </label>
            <select id="shift" name="shift" defaultValue={shift} className={selectClass({ size: 'md' })}>
              <option value="">{t('rfid.allShifts', lang)}</option>
              {configuredShifts.map((s) => (
                <option key={s} value={s}>
                  {shiftLabel(s, lang)}
                </option>
              ))}
              <option value={NO_SHIFT}>{t('rfid.noShiftAssigned', lang)}</option>
            </select>
          </div>
          <button
            type="submit"
            className={filterButtonClass()}
          >
            {t('classes.filter', lang)}
          </button>
        </Form>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-paper p-6 text-center text-sm text-muted">
          {t('rfid.noEmployees', lang)}
        </div>
      ) : (
        <RfidEntryTable
          key={`${shift}|${pageData.page}|${pageSize}`}
          kind="employee"
          rows={rows}
          headers={[t('rfid.category', lang), ...(configuredShifts.length ? [t('rfid.shift', lang)] : [])]}
          lang={lang}
        />
      )}
      {visible.length > 0 && (
        <Pager page={pageData.page} totalPages={pageData.totalPages} total={pageData.total} lang={lang} params={params} pageSize={pageSize} />
      )}
    </div>
  )
}
