import { currentLang } from '@/lib/i18n-server'
import { t, type Lang, formatDate } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { requireEmployeeAttendanceAdmin } from '@/lib/school/employee-attendance-admin'
import { AttendanceTabs } from '../../attendance-tabs'
import Form from 'next/form'
import { RequestLeaveButton, LeaveActions } from '../leave-controls'
import { LeaveDetail, LeaveStatusPill, leaveStatusChips, leaveStatusLabel } from '../leave-shared'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { DataTable, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { ViewLink } from '@/components/data-table/view-link'
import { paginate, pageSizeFrom, Pager } from '@/components/pager'
import { leavePage } from '../leave-page'
import { filterButtonClass, inputClass } from '@/components/ui/field'
import { pageTitle } from '@/lib/page-title'

// Split off the Employees half of the old unified Leave Management page (map
// #664). Employee search follows the same name-substring-over-the-full-roster
// pattern already used by Employee Attendance (app/school/attendance/employee/
// page.tsx) — `employee_card` is bounded by headcount, not a growth table —
// but the leave rows themselves are now scoped to the matched employees'
// ids in the query itself, not fetched with a flat cap and filtered after.
// Map 013: the list is the shared DataTable (status chips, pagination); a
// row's Details opens a drawer carrying the same approve/reject actions.

const PAGE_SIZE = 20

interface EmployeeLeaveRow {
  id: string
  employee_id: string
  from_day: string
  to_day: string
  reason: string | null
  status: string
  decision_note?: string | null
  decided_at?: string | null
}

export const generateMetadata = pageTitle('attendance.employeeLeaveTitle')

export default async function EmployeeLeaveManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; size?: string; rpage?: string; rsize?: string; view?: string }>
}) {
  const params = await searchParams
  const { q = '', status = '', page, size, rpage, rsize, view } = params
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()
  // #677: Owner and office staff only; a teacher is refused.
  await requireEmployeeAttendanceAdmin('/school/attendance/leave/employee')

  const { data: employees } = await supabase
    .from('employee_card')
    .select('id, full_name')
    .is('archived_at', null)
    .order('full_name')
  const allEmployees = employees ?? []

  const matchByName = (query: string) => {
    const needle = query.trim().toLowerCase()
    return needle ? allEmployees.filter((e) => e.full_name.toLowerCase().includes(needle)) : allEmployees
  }

  const filterActive = Boolean(q.trim())
  const matched = matchByName(q)
  const matchedIds = matched.map((e) => e.id)

  // The roster browser and the records table share q (audit F19).
  const rosterMatched = matched

  const leavesPage = await leavePage<EmployeeLeaveRow>({
    supabase,
    table: 'employee_leaves',
    personCol: 'employee_id',
    ids: filterActive ? matchedIds : null,
    status,
    rawPage: page,
    pageSize,
    viewId: view,
  })

  const nameById = new Map(allEmployees.map((e) => [e.id, e.full_name]))
  const withName = (l: EmployeeLeaveRow) => ({ ...l, name: nameById.get(l.employee_id) ?? '—' })
  const rows = leavesPage.rows.map(withName)
  const viewed = leavesPage.viewed ? withName(leavesPage.viewed) : undefined
  type Row = (typeof rows)[number]

  // Roster (rpage/rsize) and records (page/size) page independently.
  const rosterSize = pageSizeFrom(rsize, PAGE_SIZE)
  const rosterPage = paginate(rosterMatched, rpage, rosterSize)

  const dash = <span className="text-muted">—</span>
  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: t('attendance.leaveName', lang),
      card: 'title',
      cell: (l) => <span className="font-semibold">{l.name}</span>,
    },
    { key: 'from', header: t('attendance.leaveFromCol', lang), cell: (l) => formatDate(l.from_day, lang) },
    { key: 'to', header: t('attendance.leaveToCol', lang), cell: (l) => formatDate(l.to_day, lang) },
    {
      key: 'reason',
      header: t('attendance.leaveReasonCol', lang),
      cell: (l) => (
        <>
          {l.reason ? <span className="line-clamp-2">{l.reason}</span> : dash}
          {l.decision_note && (
            <span className="line-clamp-2 text-xs text-alert-deep">
              {t('attendance.leaveRejectReason', lang)}: {l.decision_note}
            </span>
          )}
        </>
      ),
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
        <Form className="mb-4 flex flex-wrap items-end gap-2" action="/school/attendance/leave/employee">
          {status && <input type="hidden" name="status" value={status} />}
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">{t('attendance.employeeSearch', lang)}</label>
            <input
              name="q"
              defaultValue={q}
              placeholder={t('attendance.employeeSearch', lang)}
              className={`${inputClass()} w-64`}
            />
          </div>
          <button
            type="submit"
            className={filterButtonClass()}
          >
            {t('classes.filter', lang)}
          </button>
        </Form>
        {!rosterMatched.length ? (
          <p className="text-sm text-muted">{t('attendance.none', lang)}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('attendance.leaveName', lang)}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted" />
                </tr>
              </thead>
              <tbody>
                {rosterPage.items.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-sm font-medium">{e.full_name}</td>
                    <td className="px-3 py-2 text-sm">
                      <RequestLeaveButton kind="employee" personId={e.id} personLabel={e.full_name} lang={lang} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rosterMatched.length > 0 && (
          <Pager
            page={rosterPage.page}
            totalPages={rosterPage.totalPages}
            total={rosterPage.total}
            lang={lang}
            params={params}
            pageSize={rosterSize}
            pageParam="rpage"
            sizeParam="rsize"
          />
        )}
      </section>

      <DataTable
        rows={rows}
        rowId={(l) => l.id}
        rowLabel={(l) => l.name}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('attendance.employeeLeaveTitle', lang)}
        search={{ placeholder: t('attendance.employeeSearch', lang) }}
        chips={leaveStatusChips(leavesPage.statusCounts, lang)}
        rowActions={(l) => (
          <>
            {l.status === 'pending' && <LeaveActions kind="employee" id={l.id} lang={lang} />}
            <ViewLink id={l.id} params={params} label={t('attendance.leaveDetails', lang)} name={l.name} />
          </>
        )}
        pagination={{ page: leavesPage.page, totalPages: leavesPage.totalPages, total: leavesPage.total, pageSize }}
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
