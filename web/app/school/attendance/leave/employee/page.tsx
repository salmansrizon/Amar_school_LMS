import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { AttendanceTabs } from '../../attendance-tabs'
import { RequestEmployeeLeaveForm, LeaveActions } from '../leave-controls'
import { LeaveDetail, LeaveStatusPill, leaveStatusChips, leaveStatusLabel } from '../leave-shared'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { DataTable, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { ViewLink } from '@/components/data-table/view-link'
import { paginate, pageSizeFrom } from '@/components/pager'

// Split off the Employees half of the old unified Leave Management page (map
// #664). Employee search follows the same name-substring-over-the-full-roster
// pattern already used by Employee Attendance (app/school/attendance/employee/
// page.tsx) — `employee_card` is bounded by headcount, not a growth table —
// but the leave rows themselves are now scoped to the matched employees'
// ids in the query itself, not fetched with a flat cap and filtered after.
// Map 013: the list is the shared DataTable (status chips, pagination); a
// row's Details opens a drawer carrying the same approve/reject actions.

const DEFAULT_VIEW_LIMIT = 100
const FILTERED_VIEW_LIMIT = 500
const PAGE_SIZE = 20

interface EmployeeLeaveRow {
  id: string
  employee_id: string
  from_day: string
  to_day: string
  reason: string | null
  status: string
}

export default async function EmployeeLeaveManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; size?: string; view?: string }>
}) {
  const params = await searchParams
  const { q = '', status = '', page, size, view } = params
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: employees } = await supabase
    .from('employee_card')
    .select('id, full_name')
    .is('archived_at', null)
    .order('full_name')
  const allEmployees = employees ?? []

  const filterActive = Boolean(q.trim())
  const matched = filterActive
    ? allEmployees.filter((e) => e.full_name.toLowerCase().includes(q.trim().toLowerCase()))
    : allEmployees
  const matchedIds = matched.map((e) => e.id)

  let leaves: EmployeeLeaveRow[] = []
  if (filterActive) {
    if (matchedIds.length) {
      const { data } = await supabase
        .from('employee_leaves')
        .select('id, employee_id, from_day, to_day, reason, status')
        .in('employee_id', matchedIds)
        .order('from_day', { ascending: false })
        .limit(FILTERED_VIEW_LIMIT)
      leaves = data ?? []
    }
  } else {
    const { data } = await supabase
      .from('employee_leaves')
      .select('id, employee_id, from_day, to_day, reason, status')
      .order('created_at', { ascending: false })
      .limit(DEFAULT_VIEW_LIMIT)
    leaves = data ?? []
  }

  const nameById = new Map(allEmployees.map((e) => [e.id, e.full_name]))
  const rows = leaves.map((l) => ({ ...l, name: nameById.get(l.employee_id) ?? '—' }))
  type Row = (typeof rows)[number]

  const visible = status ? rows.filter((l) => l.status === status) : rows
  const pageData = paginate(visible, page, pageSize)
  const viewed = view ? rows.find((l) => l.id === view) : undefined

  const dash = <span className="text-muted">—</span>
  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: t('attendance.leaveName', lang),
      card: 'title',
      cell: (l) => <span className="font-semibold">{l.name}</span>,
    },
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
        title={t('attendance.employeeLeaveTitle', lang)}
        crumbs={schoolCrumbs('/school/attendance', lang, { label: t('attendance.title', lang), href: '/school/attendance' }, { label: t('attendance.employeeLeaveTitle', lang) })}
      />

      <AttendanceTabs active="/school/attendance/leave/employee" lang={lang} />

      <section className="mb-grid rounded-2xl border border-line bg-paper p-card">
        <h3 className="mb-3 font-bold">{t('attendance.leaveRequestTitle', lang)}</h3>
        <RequestEmployeeLeaveForm employees={allEmployees} lang={lang} />
      </section>

      <DataTable
        rows={pageData.items}
        rowId={(l) => l.id}
        rowLabel={(l) => l.name}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('attendance.employeeLeaveTitle', lang)}
        search={{ placeholder: t('attendance.employeeSearch', lang) }}
        chips={leaveStatusChips(leaves, lang)}
        rowActions={(l) => (
          <>
            {l.status === 'pending' && <LeaveActions kind="employee" id={l.id} lang={lang} />}
            <ViewLink id={l.id} params={params} label={t('attendance.leaveDetails', lang)} name={l.name} />
          </>
        )}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={<p className="rounded-2xl border border-line bg-paper p-card text-sm text-muted">{t('attendance.none', lang)}</p>}
      />

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed?.name ?? '—'}
        subtitle={viewed ? leaveStatusLabel(viewed.status, lang) : undefined}
        fullPageLabel=""
        closeLabel={t('common.close', lang)}
      >
        {viewed && <LeaveDetail kind="employee" leave={viewed} facts={[]} lang={lang} />}
      </RecordDrawer>
    </div>
  )
}
