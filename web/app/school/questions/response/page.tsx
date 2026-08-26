import { redirect } from 'next/navigation'
import Form from 'next/form'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { responseReport, withinRange, type MessageForStats, type ResponseStats } from '@/lib/student/response-performance'
import { Card, PageHeader } from '@/components/ui/page'

// The Owner's view of how well the school answers its students (#455).
//
// Deliberately passive: no aging alert. The Class Teacher is already notified
// per question (#454); an escalating second notification to the Owner would
// turn a support tool into surveillance, and nobody asked for it. If a school
// wants one later, the notification engine is already wired.
//
// Owner-only, and ordered by name rather than by any metric — see the module.
export default async function ResponsePerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { from = '', to = '' } = await searchParams
  const lang = await currentLang()
  const { supabase, role } = await getSchoolContext()
  if (role !== 'school_owner') redirect('/school/questions')

  const [{ data: messages }, { data: classes }, { data: employees }] = await Promise.all([
    supabase
      .from('student_message_inbox')
      .select('id, subject, created_at, replied_at, class_name, section')
      .limit(2000),
    supabase.from('classes').select('name, section, class_teacher_id'),
    supabase.from('employees').select('id, full_name'),
  ])

  // A question is accounted to the Class Teacher of the asking student's class.
  // Not to whoever happened to reply: an unanswered question has no replier, and
  // "who should have answered this" is the question the Owner is asking.
  const teacherById = new Map((employees ?? []).map((e) => [e.id, e.full_name]))
  const teacherByClass = new Map(
    (classes ?? []).map((c) => [`${c.name}|${c.section ?? ''}`, c.class_teacher_id as string | null]),
  )

  const rows: MessageForStats[] = (messages ?? []).map((m) => {
    const teacherId = teacherByClass.get(`${m.class_name}|${m.section ?? ''}`) ?? null
    return {
      id: m.id,
      subject: m.subject,
      created_at: m.created_at,
      replied_at: m.replied_at,
      teacherId,
      teacherName: teacherId ? (teacherById.get(teacherId) ?? null) : null,
    }
  })

  const report = responseReport(withinRange(rows, from || null, to || null))

  const hours = (n: number | null) => (n === null ? '—' : `${n}${t('response.hours', lang)}`)

  const StatRow = ({ stats, label }: { stats: ResponseStats; label: string }) => (
    <tr className="border-b border-line last:border-0">
      <td className="px-3 py-2 text-sm font-medium">{label}</td>
      <td className="px-3 py-2 text-sm">{stats.received}</td>
      <td className="px-3 py-2 text-sm">{stats.answered}</td>
      <td className="px-3 py-2 text-sm">
        {stats.unanswered > 0 ? (
          <span className="font-semibold text-sun-deep">{stats.unanswered}</span>
        ) : (
          '—'
        )}
      </td>
      <td className="px-3 py-2 text-sm">{hours(stats.medianHours)}</td>
      <td className="px-3 py-2 text-sm">{hours(stats.slowestHours)}</td>
      <td className="px-3 py-2 text-sm">
        {stats.oldestWaiting ? (
          <span title={stats.oldestWaiting.subject}>
            {hours(stats.oldestWaiting.hours)}
            <span className="ml-1 text-xs text-muted">· {stats.oldestWaiting.subject}</span>
          </span>
        ) : (
          '—'
        )}
      </td>
    </tr>
  )

  return (
    <>
      <PageHeader title={t('response.title', lang)} backHref="/school/questions" backLabel={t('questions.title', lang)} />

      <Card>
        <p className="mb-4 text-sm text-muted">{t('response.intro', lang)}</p>

        <Form action="/school/questions/response" className="mb-4 flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-muted">
            <span className="mb-1 block">{t('response.from', lang)}</span>
            <input name="from" type="date" defaultValue={from} className="h-9 rounded-sm border border-line-strong bg-paper px-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-muted">
            <span className="mb-1 block">{t('response.to', lang)}</span>
            <input name="to" type="date" defaultValue={to} className="h-9 rounded-sm border border-line-strong bg-paper px-2 text-sm" />
          </label>
          <button type="submit" className="h-9 cursor-pointer rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted">
            {t('response.apply', lang)}
          </button>
        </Form>

        {!report.overall.received ? (
          <p className="text-sm text-muted">{t('response.none', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  {[
                    'response.teacher',
                    'response.received',
                    'response.answered',
                    'response.unanswered',
                    'response.median',
                    'response.slowest',
                    'response.oldestWaiting',
                  ].map((key) => (
                    <th key={key} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      {t(key as Parameters<typeof t>[0], lang)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b-2 border-line-strong bg-paper-muted font-semibold">
                  <td className="px-3 py-2 text-sm">Σ</td>
                  <td className="px-3 py-2 text-sm">{report.overall.received}</td>
                  <td className="px-3 py-2 text-sm">{report.overall.answered}</td>
                  <td className="px-3 py-2 text-sm">{report.overall.unanswered || '—'}</td>
                  <td className="px-3 py-2 text-sm">{hours(report.overall.medianHours)}</td>
                  <td className="px-3 py-2 text-sm">{hours(report.overall.slowestHours)}</td>
                  <td className="px-3 py-2 text-sm">{hours(report.overall.oldestWaiting?.hours ?? null)}</td>
                </tr>
                {report.perTeacher.map((stats) => (
                  <StatRow
                    key={stats.teacherId ?? 'unassigned'}
                    stats={stats}
                    label={stats.teacherName ?? t('response.unassigned', lang)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
