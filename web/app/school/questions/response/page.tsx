import Form from 'next/form'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import {
  responseReport,
  withinRange,
  schoolWideOverall,
  visibleTeacherRows,
  OWNER_BUCKET,
  type MessageForStats,
  type ResponseStats,
} from '@/lib/student/response-performance'
import { hubSummary } from '@/lib/student/hub-source'
import { Card, PageHeader } from '@/components/ui/page'
import { HubTabs } from '../../messages-hub-tabs'

// The Response tab of বার্তা ও অনুরোধ (#455 report, #509 section).
//
// Deliberately passive: no aging alert. The Class Teacher is already notified
// per question (#454); an escalating second notification to the Owner would
// turn a support tool into surveillance, and nobody asked for it.
//
// #509 drops the owner-only redirect this page used to open with. It splits by
// role instead: the Owner keeps the full per-teacher table, and a teacher sees
// **their own row plus the school-wide Σ** — enough to know "I'm at 14h, the
// school is at 9h" without publishing a league table to the people on it.
//
// The per-teacher half is a filter over rows already fetched. The Σ half is not:
// 0152 scopes her SELECT to her own classes, so her Σ has to come from
// `school_question_timings`, which returns timestamps and nothing else. See the
// comment at the call.
export default async function ResponsePerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { from = '', to = '' } = await searchParams
  const lang = await currentLang()
  const { supabase, role } = await getSchoolContext()
  const isOwner = role === 'school_owner'

  const [{ data: messages }, { data: classes }, { data: employees }, { data: repliers }, { data: myEmployeeId }, summary, schoolWide] =
    await Promise.all([
      // Scoped by 0152: a teacher's rows are her own classes', the Owner's are
      // the school's.
      supabase
        .from('student_message_inbox')
        .select('id, subject, created_at, replied_at, replied_by, status, class_name, section')
        .limit(2000),
      supabase.from('classes').select('name, section, class_teacher_id'),
      // employee_card, not employees: the base table needs the Employees grant
      // (0136) and a name is all we want.
      supabase.from('employee_card').select('id, full_name'),
      // How a reply — which records a login — reaches the Employee this table
      // keys on. A definer RPC rather than `profile_id` on employee_card,
      // because 0138 refused to widen that view into a login directory; this
      // returns only logins that have actually answered a question here (0156).
      supabase.rpc('student_message_repliers'),
      supabase.rpc('app_current_employee_id'),
      hubSummary(supabase),
      // The Σ row. For a teacher this MUST come from the definer RPC: her own
      // SELECT stops at her classes, so rolling her rows up would print her own
      // total under the school's label — a wrong number is worse than no number.
      // The RPC hands back timestamps only, so she learns the school's latency
      // and not one question outside her classes (ADR 0018 / migration 0152).
      isOwner
        ? Promise.resolve({ data: null })
        : supabase.rpc('school_question_timings', { p_from: from || null, p_to: to || null }),
    ])

  // An answered question is accounted to whoever replied; an unanswered one to
  // the Class Teacher of the asking student's class, because an unanswered
  // question has no replier and "who should have answered this" is the question
  // being asked. ADR 0019.
  const teacherById = new Map((employees ?? []).map((e) => [e.id, e.full_name]))
  const employeeByProfile = new Map(
    ((repliers ?? []) as { profile_id: string; employee_id: string }[]).map((r) => [
      r.profile_id,
      r.employee_id,
    ]),
  )
  const teacherByClass = new Map(
    (classes ?? []).map((c) => [`${c.name}|${c.section ?? ''}`, c.class_teacher_id as string | null]),
  )

  // A reply records a login. A login with no Employee record behind it is the
  // School Owner — every other actor who may reply holds a class attachment,
  // and an attachment is read off an `employees` row (ADR 0018). So the fallback
  // is not a guess; it is the only remaining case.
  const repliedBy = (profileId: string | null): string | null =>
    profileId ? (employeeByProfile.get(profileId) ?? OWNER_BUCKET) : null

  const rows: MessageForStats[] = (messages ?? []).map((m) => {
    const teacherId = teacherByClass.get(`${m.class_name}|${m.section ?? ''}`) ?? null
    const repliedById = repliedBy(m.replied_by)
    return {
      id: m.id,
      subject: m.subject,
      created_at: m.created_at,
      replied_at: m.replied_at,
      status: m.status,
      teacherId,
      teacherName: teacherId ? (teacherById.get(teacherId) ?? null) : null,
      repliedById,
      repliedByName: repliedById ? (teacherById.get(repliedById) ?? null) : null,
    }
  })

  const report = responseReport(withinRange(rows, from || null, to || null))
  const me = (myEmployeeId as string | null) ?? null

  // Both halves of the table come from lib/student/response-performance.ts, so
  // "median" has one definition and the Owner's figures and a teacher's are
  // computed the same way. The Owner needs no RPC — her own rows already are
  // the school.
  const schoolTimings = (schoolWide.data ?? null) as { created_at: string; replied_at: string | null }[] | null
  const overall = schoolTimings ? schoolWideOverall(schoolTimings) : report.overall
  const perTeacher = visibleTeacherRows(report, { isOwner, employeeId: me })

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
      <PageHeader title={t('hub.title', lang)} />
      <HubTabs active="/school/questions/response" lang={lang} summary={summary} />

      <Card>
        <p className="mb-4 text-sm text-muted">
          {t(isOwner ? 'response.intro' : 'response.introTeacher', lang)}
        </p>

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
          <p className="text-sm text-muted">
            {summary.reachesAnyClass ? t('response.none', lang) : t('hub.noClasses', lang)}
          </p>
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
                  <td className="px-3 py-2 text-sm">
                    Σ <span className="ml-1 text-xs font-normal text-muted">{t('response.schoolWide', lang)}</span>
                  </td>
                  <td className="px-3 py-2 text-sm">{overall.received}</td>
                  <td className="px-3 py-2 text-sm">{overall.answered}</td>
                  <td className="px-3 py-2 text-sm">{overall.unanswered || '—'}</td>
                  <td className="px-3 py-2 text-sm">{hours(overall.medianHours)}</td>
                  <td className="px-3 py-2 text-sm">{hours(overall.slowestHours)}</td>
                  <td className="px-3 py-2 text-sm">{hours(overall.oldestWaiting?.hours ?? null)}</td>
                </tr>
                {perTeacher.map((stats) => (
                  <StatRow
                    key={stats.teacherId ?? 'unassigned'}
                    stats={stats}
                    label={
                      !isOwner && stats.teacherId === me
                        ? t('response.mine', lang)
                        : stats.teacherId === OWNER_BUCKET
                          ? t('response.owner', lang)
                          : (stats.teacherName ?? t('response.unassigned', lang))
                    }
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
