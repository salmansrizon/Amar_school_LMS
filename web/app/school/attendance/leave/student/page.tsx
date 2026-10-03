import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolRosterRead, filterSchoolRoster } from '@/lib/school/roster-source'
import { AttendanceTabs } from '../../attendance-tabs'
import Form from 'next/form'
import { RequestLeaveButton, LeaveActions } from '../leave-controls'
import { LeaveDetail, LeaveStatusPill, leaveStatusChips, leaveStatusLabel } from '../leave-shared'
import { PageHeader } from '@/components/ui/page'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { DataTable, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { ViewLink } from '@/components/data-table/view-link'
import { paginate, pageSizeFrom } from '@/components/pager'
import { ClassSectionSelect } from '@/components/ui/class-section-select'

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
  searchParams: Promise<{ classSection?: string; q?: string; status?: string; page?: string; size?: string; view?: string; rosterClass?: string; rosterQ?: string }>
}) {
  const params = await searchParams
  const { classSection = '', q = '', status = '', page, size, view, rosterClass = '', rosterQ = '' } = params
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const lang: Lang = await currentLang()
  const { supabase, shiftSelection, startedAcademicYears, academicYearSelection } = await getSchoolContext()
  const showYear = startedAcademicYears.length > 1

  // One roster read, filtered two independent ways (map #668): the "who can I
  // request leave for" browser below has its own class/search filter
  // (rosterClass/rosterQ), kept separate from this filter (classSection/q,
  // which scopes the leave-records table further down) so neither section's
  // filter resets the other on submit — each Form below carries the other's
  // current values as hidden fields for exactly that reason. Reading once via
  // schoolRosterRead and filtering twice avoids paying for the students +
  // class_offerings round trip a second time just to apply a second filter.
  const read = await schoolRosterRead(supabase, { shiftSelection, academicYearSelection })
  const { combos, students: matched } = filterSchoolRoster(read, { classSection, q, showYear })
  const { students: rosterStudents } = filterSchoolRoster(read, { classSection: rosterClass, q: rosterQ, showYear })

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
        <Form className="mb-4 flex flex-wrap items-end gap-2" action="/school/attendance/leave/student">
          {/* Preserves the leave-records filter below across this form's own submit. */}
          <input type="hidden" name="classSection" value={classSection} />
          <input type="hidden" name="q" value={q} />
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">{t('attendance.classSection', lang)}</label>
            <ClassSectionSelect
              combos={combos}
              value={rosterClass}
              name="rosterClass"
              ariaLabel={t('attendance.classSection', lang)}
              allLabel={t('attendance.allClasses', lang)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">{t('attendance.leaveSearchStudent', lang)}</label>
            <input
              name="rosterQ"
              defaultValue={rosterQ}
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
        {!rosterStudents.length ? (
          <p className="text-sm text-muted">{t('attendance.none', lang)}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('attendance.rollCol', lang)}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('attendance.leaveName', lang)}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('attendance.classSection', lang)}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted" />
                </tr>
              </thead>
              <tbody>
                {rosterStudents.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-sm">{s.roll_number ?? '—'}</td>
                    <td className="px-3 py-2 text-sm font-medium">{s.full_name}</td>
                    <td className="px-3 py-2 text-sm">
                      {s.class_name ?? '—'}
                      {s.section ? ` / ${s.section}` : ''}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <RequestLeaveButton kind="student" personId={s.id} personLabel={s.full_name} lang={lang} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
