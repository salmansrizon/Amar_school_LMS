import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolRoster } from '@/lib/school/roster-source'
import { AttendanceTabs } from '../../attendance-tabs'
import { RequestStudentLeaveForm, LeaveActions } from '../leave-controls'
import { LeaveDetail, LeaveStatusPill, leaveStatusChips, leaveStatusLabel } from '../leave-shared'
import { PageHeader } from '@/components/ui/page'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { DataTable, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { ViewLink } from '@/components/data-table/view-link'
import { paginate, pageSizeFrom } from '@/components/pager'

// Split off the Students half of the old unified Leave Management page (map
// #664): search is now Class (schoolRoster's own picker) + name/roll text,
// resolved into a Supabase query scoped to the matched students' ids rather
// than fetching a flat 200-row cap and filtering in memory — a filter that
// matches students outside that cap can no longer silently disappear.
// Map 013: the list is the shared DataTable (status chips, pagination); a
// row's Details opens a drawer carrying the same approve/reject actions.

const DEFAULT_VIEW_LIMIT = 100
const FILTERED_VIEW_LIMIT = 500
const PAGE_SIZE = 20

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
  searchParams: Promise<{ classSection?: string; q?: string; status?: string; page?: string; size?: string; view?: string }>
}) {
  const params = await searchParams
  const { classSection = '', q = '', status = '', page, size, view } = params
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
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
  type Row = (typeof rows)[number]

  const visible = status ? rows.filter((l) => l.status === status) : rows
  const pageData = paginate(visible, page, pageSize)
  const viewed = view ? rows.find((l) => l.id === view) : undefined

  const dash = <span className="text-muted">—</span>
  const classOf = (s: Row['student']) => (s?.class_name ? `${s.class_name}${s.section ? ` / ${s.section}` : ''}` : null)

  const columns: Column<Row>[] = [
    { key: 'roll', header: t('attendance.rollCol', lang), cell: (l) => l.student?.roll_number ?? dash },
    {
      key: 'name',
      header: t('attendance.leaveName', lang),
      card: 'title',
      cell: (l) => <span className="font-semibold">{l.student?.full_name ?? '—'}</span>,
    },
    { key: 'class', header: t('attendance.classSection', lang), cell: (l) => classOf(l.student) ?? dash },
    { key: 'from', header: t('attendance.leaveFromCol', lang), cell: (l) => l.from_day },
    { key: 'to', header: t('attendance.leaveToCol', lang), cell: (l) => l.to_day },
    {
      key: 'reason',
      header: t('attendance.leaveReasonCol', lang),
      cell: (l) => (l.reason ? <span className="line-clamp-2">{l.reason}</span> : dash),
    },
    {
      key: 'status',
      header: t('attendance.leaveStatusCol', lang),
      card: 'badge',
      cell: (l) => <LeaveStatusPill status={l.status} lang={lang} />,
    },
  ]

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

      <DataTable
        rows={pageData.items}
        rowId={(l) => l.id}
        rowLabel={(l) => l.student?.full_name ?? '—'}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('attendance.studentLeaveTitle', lang)}
        search={{ placeholder: t('attendance.leaveSearchStudent', lang) }}
        filters={[{ param: 'classSection', label: t('attendance.classSection', lang), options: combos }]}
        chips={leaveStatusChips(leaves, lang)}
        rowActions={(l) => (
          <>
            {l.status === 'pending' && <LeaveActions kind="student" id={l.id} lang={lang} />}
            <ViewLink id={l.id} params={params} label={t('attendance.leaveDetails', lang)} name={l.student?.full_name ?? '—'} />
          </>
        )}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={<p className="rounded-2xl border border-line bg-paper p-card text-sm text-muted">{t('attendance.none', lang)}</p>}
      />

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed?.student?.full_name ?? '—'}
        subtitle={viewed ? leaveStatusLabel(viewed.status, lang) : undefined}
        fullPageLabel=""
        closeLabel={t('common.close', lang)}
      >
        {viewed && (
          <LeaveDetail
            kind="student"
            leave={viewed}
            facts={[
              {
                label: t('attendance.rollCol', lang),
                value: viewed.student?.roll_number != null ? String(viewed.student.roll_number) : '—',
              },
              { label: t('attendance.classSection', lang), value: classOf(viewed.student) ?? '—' },
            ]}
            lang={lang}
          />
        )}
      </RecordDrawer>
    </div>
  )
}
