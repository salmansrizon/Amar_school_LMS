import { currentLang } from '@/lib/i18n-server'
import { t, type MessageKey } from '@/lib/i18n'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { LeaveRequestForm } from './leave-form'

const STATUS_LABEL: Record<string, MessageKey> = {
  pending: 'student.leavePending',
  approved: 'student.leaveApproved',
  rejected: 'student.leaveRejected',
}

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-sun-soft text-sun-deep',
  approved: 'bg-mint-soft text-mint-deep',
  rejected: 'bg-alert-soft text-alert-deep',
}

// The Student's leave requests (#452). The request joins the SAME owner queue
// Attendance I already built — nothing new on the staff side.
export default async function StudentLeavePage() {
  const lang = await currentLang()
  const ctx = await getStudentContext()

  const { data: leaves } = await ctx.supabase
    .from('student_leaves')
    .select('id, from_day, to_day, reason, status, created_at')
    .order('from_day', { ascending: false })

  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })

  return (
    <main className="w-full max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-extrabold">{t('student.leaveTitle', lang)}</h1>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <LeaveRequestForm lang={lang} disabled={isReadOnly(ctx)} />
      </section>

      {!leaves?.length ? (
        <p className="rounded-lg border border-line bg-paper p-6 text-sm text-muted">
          {t('student.noLeave', lang)}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-paper">
          {leaves.map((leave) => (
            <li key={leave.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <span>
                <span className="block text-sm font-medium">
                  {fmt(leave.from_day)}
                  {leave.to_day !== leave.from_day && ` – ${fmt(leave.to_day)}`}
                </span>
                {leave.reason && <span className="block text-xs text-muted">{leave.reason}</span>}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[leave.status] ?? ''}`}
              >
                {t(STATUS_LABEL[leave.status] ?? 'student.leavePending', lang)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
