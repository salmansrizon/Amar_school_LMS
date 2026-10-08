import { currentLang } from '@/lib/i18n-server'
import { t, formatDate, formatNumber, type MessageKey } from '@/lib/i18n'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { schoolToday } from '@/lib/school-time'
import { withLeaveColumns } from '@/lib/leave-columns'
import { LeaveRequestForm, WithdrawLeaveButton } from './leave-form'
import { orderLeaves } from '@/lib/student/daily'
import { leaveDays, matchesQ, pageOf } from '@/lib/student/table'
import { studentGroupTabs } from '@/lib/student-nav'
import { pageTitle } from '@/lib/page-title'
import { Card, PageHeader } from '@/components/ui/page'
import { SectionTabs } from '@/components/ui/section-tabs'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { NoMatch } from '@/components/student/no-match'

const STATUS_LABEL: Record<string, MessageKey> = {
  pending: 'student.leavePending',
  approved: 'student.leaveApproved',
  rejected: 'student.leaveRejected',
}

const STATUS_TONE = { pending: 'sky', approved: 'mint', rejected: 'alert' } as const

// The Student's leave requests (#452). The request joins the SAME owner queue
// Attendance I already built — nothing new on the staff side.
export const generateMetadata = pageTitle('student.leaveTitle')

type Leave = { id: string; from_day: string; to_day: string; reason: string | null; status: string; created_at: string; decision_note?: string | null; decided_at?: string | null }

export default async function StudentLeavePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const lang = await currentLang()
  const ctx = await getStudentContext()

  // decision_note / decided_at arrive with migration 0219; read without them until then.
  const readLeaves = (cols: string) =>
    ctx.supabase.from('student_leaves').select(cols).order('from_day', { ascending: false })
  const { data } = await withLeaveColumns(
    () => readLeaves('id, from_day, to_day, reason, status, created_at, decision_note, decided_at'),
    () => readLeaves('id, from_day, to_day, reason, status, created_at'),
  )
  const leaves = (data ?? []) as unknown as Leave[]

  // Pending requests first, then newest.
  const requests = orderLeaves(leaves)
  const shown = requests.filter((l) => matchesQ(params.q, l.reason) && (!params.status || l.status === params.status))
  const paged = pageOf(shown, params)
  const readOnly = isReadOnly(ctx)

  const columns: Column<Leave>[] = [
    {
      key: 'from',
      header: t('student.leaveFrom', lang),
      card: 'title',
      cell: (l) => <span className="font-semibold">{formatDate(l.from_day, lang)}</span>,
    },
    { key: 'to', header: t('student.leaveTo', lang), cell: (l) => formatDate(l.to_day, lang) },
    { key: 'days', header: t('student.col.days', lang), cell: (l) => formatNumber(leaveDays(l.from_day, l.to_day), lang) },
    {
      key: 'reason',
      header: t('student.leaveReason', lang),
      className: 'max-w-xs',
      cell: (l) => (
        <>
          {l.reason ? <span className="line-clamp-2 whitespace-normal" title={l.reason}>{l.reason}</span> : <span className="text-muted">—</span>}
          {l.status === 'rejected' && l.decision_note && (
            <span className="mt-1 block whitespace-normal text-xs text-alert-deep">
              {t('student.leaveRejectReason', lang)}: {l.decision_note}
            </span>
          )}
        </>
      ),
    },
    {
      key: 'status',
      header: t('student.col.state', lang),
      card: 'badge',
      cell: (l) => (
        <>
          <Pill tone={STATUS_TONE[l.status as keyof typeof STATUS_TONE] ?? 'muted'}>
            {t(STATUS_LABEL[l.status] ?? 'student.leavePending', lang)}
          </Pill>
          {l.decided_at && l.status !== 'pending' && (
            <span className="mt-1 block text-xs text-muted">
              {t('student.leaveDecidedOn', lang)} {formatDate(l.decided_at, lang)}
            </span>
          )}
        </>
      ),
    },
  ]

  return (
    <main className="w-full px-gutter pt-section pb-16">
      <PageHeader
        title={t('student.leaveTitle', lang)}
        crumbs={{ lang, items: [{ label: t('student.nav.home', lang), href: '/student' }, { label: t('student.navGroup.attendance', lang) }] }}
      />
      <SectionTabs
        tabs={studentGroupTabs('attendance')}
        active="/student/leave"
        lang={lang}
        label={t('student.navGroup.attendance', lang)}
      />

      <div className="grid items-start gap-grid lg:grid-cols-3">
        {/* Pending requests first, then newest; the form sits beside the list on
            desktop and below it on a phone. */}
        <section className="lg:col-span-2">
          <h2 className="mb-3 font-bold">{t('student.myRequests', lang)}</h2>
          {!requests.length ? (
            <Card>
              <p className="text-sm text-muted">{t('student.noLeave', lang)}</p>
            </Card>
          ) : (
            <DataTable
              rows={paged.items}
              rowId={(l) => l.id}
              rowLabel={(l) => formatDate(l.from_day, lang)}
              columns={columns}
              lang={lang}
              params={params}
              caption={t('student.myRequests', lang)}
              search={{ placeholder: t('student.col.searchReason', lang) }}
              filters={[
                {
                  param: 'status',
                  label: t('student.col.state', lang),
                  options: Object.entries(STATUS_LABEL).map(([value, key]) => ({ value, label: t(key, lang) })),
                },
              ]}
              rowActions={(l) =>
                l.status === 'pending' ? <WithdrawLeaveButton lang={lang} leaveId={l.id} disabled={readOnly} /> : null
              }
              pagination={{ page: paged.page, totalPages: paged.totalPages, total: paged.total, pageSize: paged.pageSize }}
              empty={<NoMatch lang={lang} />}
            />
          )}
        </section>

        <div id="new-leave" className="scroll-mt-24">
          <Card>
            <h2 className="mb-3 font-bold">{t('student.requestLeave', lang)}</h2>
            <LeaveRequestForm lang={lang} disabled={readOnly} today={schoolToday()} />
          </Card>
        </div>
      </div>
    </main>
  )
}
