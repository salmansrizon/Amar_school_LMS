import Form from 'next/form'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolRoster } from '@/lib/school/roster-source'
import { AttendanceTabs } from '../../attendance-tabs'
import { RequestStudentLeaveForm, LeaveActions } from '../leave-controls'
import { ClassSectionSelect } from '@/components/ui/class-section-select'
import { PageHeader, railClass, type Tone } from '@/components/ui/page'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { Pill } from '@/components/data-table/data-table'

// Split off the Students half of the old unified Leave Management page (map
// #664): search is now Class (schoolRoster's own picker) + name/roll text,
// resolved into a Supabase query scoped to the matched students' ids rather
// than fetching a flat 200-row cap and filtering in memory — a filter that
// matches students outside that cap can no longer silently disappear.
const STATUS_TONE: Record<string, 'sun' | 'mint' | 'alert'> = {
  pending: 'sun',
  approved: 'mint',
  rejected: 'alert',
}
const STATUS_RAIL: Record<string, Tone> = {
  pending: 'sun',
  approved: 'mint',
  rejected: 'alert',
}
const STATUS_KEY: Record<string, 'attendance.leavePending' | 'attendance.leaveApproved' | 'attendance.leaveRejected'> = {
  pending: 'attendance.leavePending',
  approved: 'attendance.leaveApproved',
  rejected: 'attendance.leaveRejected',
}

const DEFAULT_VIEW_LIMIT = 100
const FILTERED_VIEW_LIMIT = 500

interface StudentLeaveRow {
  id: string
  student_id: string
  from_day: string
  to_day: string
  reason: string | null
  status: string
}

export default async function StudentLeaveManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ classSection?: string; q?: string }>
}) {
  const { classSection = '', q = '' } = await searchParams
  const lang: Lang = await currentLang()
  const { supabase, shiftSelection, startedAcademicYears, academicYearSelection } = await getSchoolContext()
  const showYear = startedAcademicYears.length > 1

  const [{ data: allStudents }, { combos, students: matched }] = await Promise.all([
    supabase.from('students').select('id, full_name').order('full_name'),
    schoolRoster(supabase, { classSection, q, shiftSelection, showYear, academicYearSelection }),
  ])

  const filterActive = Boolean(classSection || q)
  const matchedIds = matched.map((s) => s.id)
  let leaves: StudentLeaveRow[] = []
  if (filterActive) {
    if (matchedIds.length) {
      const { data } = await supabase
        .from('student_leaves')
        .select('id, student_id, from_day, to_day, reason, status')
        .in('student_id', matchedIds)
        .order('from_day', { ascending: false })
        .limit(FILTERED_VIEW_LIMIT)
      leaves = data ?? []
    }
  } else {
    const { data } = await supabase
      .from('student_leaves')
      .select('id, student_id, from_day, to_day, reason, status')
      .order('created_at', { ascending: false })
      .limit(DEFAULT_VIEW_LIMIT)
    leaves = data ?? []
  }

  // Looked up by the leave rows' own student_ids, not from `matched` — the
  // roster is also narrowed by the caller's Global Academic Year Selection
  // (schoolRoster/applyGlobalYearFilterToStudents), which would otherwise
  // blank out the name/roll/class of a leave belonging to a student outside
  // the selected year(s) while leaving the row itself fully actionable.
  const leaveStudentIds = [...new Set(leaves.map((l) => l.student_id))]
  const { data: leaveStudents } = leaveStudentIds.length
    ? await supabase.from('students').select('id, full_name, roll_number, class_name, section').in('id', leaveStudentIds)
    : { data: [] }
  const infoById = new Map((leaveStudents ?? []).map((s) => [s.id, s]))
  const rows = leaves.map((l) => ({ ...l, student: infoById.get(l.student_id) ?? null }))

  const counts = leaves.reduce(
    (acc, l) => ({ ...acc, [l.status]: (acc[l.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  )

  return (
    <div>
      <PageHeader
        title={t('attendance.studentLeaveTitle', lang)}
        crumbs={schoolCrumbs('/school/attendance', lang, { label: t('attendance.title', lang), href: '/school/attendance' }, { label: t('attendance.studentLeaveTitle', lang) })}
      />

      <AttendanceTabs active="/school/attendance/leave/student" lang={lang} />

      <section className="mb-grid rounded-2xl border border-line bg-paper p-card">
        <h3 className="mb-3 font-bold">{t('attendance.leaveRequestTitle', lang)}</h3>
        <RequestStudentLeaveForm students={allStudents ?? []} lang={lang} />
      </section>

      <Form className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-paper p-card" action="/school/attendance/leave/student">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">{t('attendance.classSection', lang)}</label>
          <ClassSectionSelect
            combos={combos}
            value={classSection}
            ariaLabel={t('attendance.classSection', lang)}
            allLabel={t('attendance.allClasses', lang)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">{t('attendance.leaveSearchStudent', lang)}</label>
          <input
            name="q"
            defaultValue={q}
            placeholder={t('attendance.leaveSearchStudent', lang)}
            className="w-64 rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          className="h-9 cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('classes.filter', lang)}
        </button>
      </Form>

      {leaves.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t('attendance.leaveStatusSummary', lang)}:
          </span>
          {(['pending', 'approved', 'rejected'] as const).map(
            (status) =>
              counts[status] > 0 && (
                <Pill key={status} tone={STATUS_TONE[status]}>
                  {t(STATUS_KEY[status], lang)}: {counts[status]}
                </Pill>
              ),
          )}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-line bg-paper">
        {!rows.length ? (
          <p className="p-card text-sm text-muted">{t('attendance.none', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-paper-muted">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted">{t('attendance.rollCol', lang)}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted">{t('attendance.leaveName', lang)}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted">{t('attendance.classSection', lang)}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted">{t('attendance.leaveFromCol', lang)}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted">{t('attendance.leaveToCol', lang)}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted">{t('attendance.leaveReasonCol', lang)}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted">{t('attendance.leaveStatusCol', lang)}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td className={`px-4 py-3 text-sm ${railClass(STATUS_RAIL[l.status])}`}>{l.student?.roll_number ?? '—'}</td>
                    <td className="px-4 py-3 text-sm font-medium">{l.student?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      {l.student?.class_name ?? '—'}
                      {l.student?.section ? ` / ${l.student.section}` : ''}
                    </td>
                    <td className="px-4 py-3 text-sm">{l.from_day}</td>
                    <td className="px-4 py-3 text-sm">{l.to_day}</td>
                    <td className="px-4 py-3 text-sm">{l.reason ?? <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3 text-sm">
                      <Pill tone={STATUS_TONE[l.status]}>{t(STATUS_KEY[l.status], lang)}</Pill>
                    </td>
                    <td className="px-4 py-3 text-sm">{l.status === 'pending' && <LeaveActions kind="student" id={l.id} lang={lang} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
