import Form from 'next/form'
import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolRoster } from '@/lib/school/roster-source'
import { AttendanceTabs } from '../../attendance-tabs'
import { RequestStudentLeaveForm, LeaveActions } from '../leave-controls'
import { ClassSectionSelect } from '@/components/ui/class-section-select'
import { railClass, type Tone } from '@/components/ui/page'

// Split off the Students half of the old unified Leave Management page (map
// #664): search is now Class (schoolRoster's own picker) + name/roll text,
// resolved into a Supabase query scoped to the matched students' ids rather
// than fetching a flat 200-row cap and filtering in memory — a filter that
// matches students outside that cap can no longer silently disappear.
const STATUS_PILL: Record<string, string> = {
  pending: 'bg-sun-soft text-sun-deep',
  approved: 'bg-mint-soft text-mint-deep',
  rejected: 'bg-alert-soft text-alert-deep',
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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('attendance.studentLeaveTitle', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <AttendanceTabs active="/school/attendance/leave/student" lang={lang} />

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <h3 className="mb-3 font-bold">{t('attendance.leaveRequestTitle', lang)}</h3>
        <RequestStudentLeaveForm students={allStudents ?? []} lang={lang} />
      </section>

      <Form className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-paper p-5" action="/school/attendance/leave/student">
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
                <span key={status} className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_PILL[status]}`}>
                  {t(STATUS_KEY[status], lang)}: {counts[status]}
                </span>
              ),
          )}
        </div>
      )}

      <section className="rounded-lg border border-line bg-paper p-5">
        {!rows.length ? (
          <p className="text-sm text-muted">{t('attendance.none', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('attendance.rollCol', lang)}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('attendance.leaveName', lang)}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('attendance.classSection', lang)}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('attendance.leaveFromCol', lang)}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('attendance.leaveToCol', lang)}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('attendance.leaveReasonCol', lang)}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('attendance.leaveStatusCol', lang)}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted" />
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className="border-b border-line">
                    <td className={`px-3 py-2 text-sm ${railClass(STATUS_RAIL[l.status])}`}>{l.student?.roll_number ?? '—'}</td>
                    <td className="px-3 py-2 text-sm font-medium">{l.student?.full_name ?? '—'}</td>
                    <td className="px-3 py-2 text-sm">
                      {l.student?.class_name ?? '—'}
                      {l.student?.section ? ` / ${l.student.section}` : ''}
                    </td>
                    <td className="px-3 py-2 text-sm">{l.from_day}</td>
                    <td className="px-3 py-2 text-sm">{l.to_day}</td>
                    <td className="px-3 py-2 text-sm">{l.reason ?? <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2 text-sm">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_PILL[l.status]}`}>
                        {t(STATUS_KEY[l.status], lang)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm">{l.status === 'pending' && <LeaveActions kind="student" id={l.id} lang={lang} />}</td>
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
