import { currentLang } from '@/lib/i18n-server'
import { t, formatDate, type MessageKey } from '@/lib/i18n'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { schoolToday } from '@/lib/school-time'
import { LeaveRequestForm, WithdrawLeaveButton } from './leave-form'
import { orderLeaves } from '@/lib/student/daily'
import { studentGroupTabs } from '@/lib/student-nav'
import { pageTitle } from '@/lib/page-title'
import { Card, PageHeader, railClass, type Tone } from '@/components/ui/page'
import { SectionTabs } from '@/components/ui/section-tabs'

const STATUS_LABEL: Record<string, MessageKey> = {
  pending: 'student.leavePending',
  approved: 'student.leaveApproved',
  rejected: 'student.leaveRejected',
}

const STATUS_RAIL: Record<string, Tone> = { pending: 'sky', approved: 'mint', rejected: 'alert' }
const STATUS_TEXT: Record<string, string> = {
  pending: 'text-sky-deep',
  approved: 'text-mint-deep',
  rejected: 'text-alert-deep',
}

// The Student's leave requests (#452). The request joins the SAME owner queue
// Attendance I already built — nothing new on the staff side.
export const generateMetadata = pageTitle('student.leaveTitle')

export default async function StudentLeavePage() {
  const lang = await currentLang()
  const ctx = await getStudentContext()

  const { data: leaves } = await ctx.supabase
    .from('student_leaves')
    .select('id, from_day, to_day, reason, status, created_at')
    .order('from_day', { ascending: false })

  const requests = orderLeaves(leaves ?? [])
  const range = (from: string, to: string) =>
    from === to ? formatDate(from, lang) : `${formatDate(from, lang)} – ${formatDate(to, lang)}`

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
            <Card padded={false}>
              <ul className="divide-y divide-line">
                {requests.map((leave) => (
                  <li
                    key={leave.id}
                    className={`flex flex-wrap items-center justify-between gap-2 px-card py-3 ${railClass(STATUS_RAIL[leave.status])}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{range(leave.from_day, leave.to_day)}</span>
                      {leave.reason && <span className="block text-xs text-muted">{leave.reason}</span>}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className={`text-xs font-bold ${STATUS_TEXT[leave.status] ?? ''}`}>
                        {t(STATUS_LABEL[leave.status] ?? 'student.leavePending', lang)}
                      </span>
                      {leave.status === 'pending' && (
                        <WithdrawLeaveButton lang={lang} leaveId={leave.id} disabled={isReadOnly(ctx)} />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <div id="new-leave" className="scroll-mt-24">
          <Card>
            <h2 className="mb-3 font-bold">{t('student.requestLeave', lang)}</h2>
            <LeaveRequestForm lang={lang} disabled={isReadOnly(ctx)} today={schoolToday()} />
          </Card>
        </div>
      </div>
    </main>
  )
}
