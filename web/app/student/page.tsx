import Link from 'next/link'
import { CalendarClock, CalendarDays } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, formatDate, formatMoney, formatNumber, localeOf, type Lang } from '@/lib/i18n'
import { getStudentContext, isReadOnly } from '@/lib/student/context'
import { loadStudentRoutine } from '@/lib/student/routine-source'
import { todayAndTomorrow } from '@/lib/student/routine'
import { addDays, schoolToday } from '@/lib/school-time'
import { loadNoticeFeed } from '@/lib/student/notices-source'
import { loadStudentTasks } from '@/lib/student/tasks-read'
import { monthLabel, type FeeRecord } from '@/lib/student/fees'
import { attendancePercent } from '@/lib/student/attendance'
import type { ExamRoutineRow } from '@/lib/student/exam-schedule'
import type { ResultRow } from '@/lib/student/results'
import {
  attendanceBand,
  buildStudentAlerts,
  buildStudentUpcoming,
  dashboardTaskCounts,
  feeStatus,
  formatClock,
  latestResult,
  type AlertLeave,
  type AlertMessage,
  type StudentAlert,
} from '@/lib/student/dashboard'
import { studentGroupTabs } from '@/lib/student-nav'
import { pageTitle } from '@/lib/page-title'
import { Icon } from '@/components/school-icons'
import { UpcomingList } from '@/components/upcoming-list'
import { Card, PageHeader } from '@/components/ui/page'
import { SectionTabs } from '@/components/ui/section-tabs'
import {
  AlertStrip,
  QuickActions,
  StatCard,
  StatGrid,
  WarningBanner,
  WorkflowCard,
  type Alert,
  type QuickAction,
} from '@/components/ui/widgets'
import { EmptyDay, PeriodList, emptyDayMessage } from './day-plan'
import { NoticeRows } from './home-cards'

// Student home, in the School Owner dashboard's shape (app/school/page.tsx):
// header → "needs you now" strip → 4 stat cards → quick steps → today's
// routine | upcoming + latest notices. The urgency rules live in
// lib/student/dashboard.ts; this file only reads and lays out.
//
// Every read here is one the Student is allowed under RLS. Grading tables are
// not among them (#702), so the result card shows raw marks and rank only.
export const generateMetadata = pageTitle('home.student')

// ponytail: holidays further out than this do not reach the "upcoming" list.
const HOLIDAY_HORIZON_DAYS = 30

function ViewAll({ href, lang }: { href: string; lang: Lang }) {
  return (
    <div className="mt-auto border-t border-line pt-4 text-center">
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline max-sm:min-h-11"
      >
        {t('dash.viewAll', lang)}
        <Icon name="chevronRight" className="size-3.5" />
      </Link>
    </div>
  )
}

export default async function StudentHome() {
  const lang = await currentLang()
  const ctx = await getStudentContext()
  const { student, supabase } = ctx
  const readOnly = isReadOnly(ctx)

  const now = new Date()
  const today = schoolToday(now)
  const monthStart = `${today.slice(0, 7)}-01`
  const horizon = Array.from({ length: HOLIDAY_HORIZON_DAYS }, (_, i) => addDays(today, i))

  const [routine, feed, tasks, feeRes, examRes, presentRes, absentRes, leaveRes, messageRes, result] = await Promise.all([
    loadStudentRoutine(supabase, lang, horizon),
    loadNoticeFeed(supabase, 30),
    loadStudentTasks(supabase),
    supabase.from('student_fee_record').select('*'),
    supabase.from('student_exam_routine').select('*').gte('exam_date', today).order('exam_date').limit(20),
    // Month to date, not the whole month: days that have not happened yet are
    // not absences.
    supabase.from('attendance_records').select('att_date').gte('att_date', monthStart).lte('att_date', today),
    supabase.rpc('student_absent_working_days', { p_start: monthStart, p_end: today }),
    supabase
      .from('student_leaves')
      .select('from_day, to_day, status, created_at')
      .in('status', ['pending', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('student_messages')
      .select('subject, status, replied_at, created_at')
      .neq('status', 'answered')
      .is('replied_at', null)
      .order('created_at')
      .limit(20),
    // The rank needs the exam id, so it chains on the result rows rather than
    // costing a second round trip after everything else.
    Promise.all([
      supabase.from('student_exam_result').select('*'),
      supabase.from('student_subject_option').select('id'),
    ]).then(async ([rows, subjects]) => {
      const latest = latestResult((rows.data ?? []) as ResultRow[], (subjects.data ?? []) as { id: string }[])
      // No rank beside an incomplete result: the same rule as the result page.
      const { data } =
        latest.state === 'ok' ? await supabase.rpc('student_exam_rank', { p_exam: latest.examId }) : { data: null }
      return { latest, rank: (data as { rank: number; out_of: number }[] | null)?.[0] ?? null }
    }),
  ])

  const fmt = (n: number) => formatNumber(n, lang)
  const feeRows = (feeRes.data ?? []) as FeeRecord[]
  const examRows = (examRes.data ?? []) as ExamRoutineRow[]
  const [todayPlan, tomorrowPlan] = todayAndTomorrow(today, routine.rows, routine.offDays)

  const taskCounts = dashboardTaskCounts(tasks, today)
  const fee = feeStatus(feeRows, today)
  const presentDays = new Set((presentRes.data ?? []).map((r) => r.att_date as string)).size
  const absentDays = typeof absentRes.data === 'number' ? absentRes.data : 0
  // With no present row the school has not taken attendance yet; 0% would
  // accuse the student of something nobody recorded.
  const percent = presentDays ? attendancePercent(presentDays, absentDays) : null
  const attTone = attendanceBand(percent)
  const { latest, rank } = result

  const range = (l: AlertLeave) =>
    l.from_day === l.to_day ? formatDate(l.from_day, lang) : `${formatDate(l.from_day, lang)} – ${formatDate(l.to_day, lang)}`
  const more = (n: number) => (n > 1 ? ` +${fmt(n - 1)}` : '')
  const alertText = (a: StudentAlert): { title: string; body?: string } => {
    switch (a.kind) {
      case 'tasksOverdue':
        return { title: `${fmt(a.count)} ${t('student.dash.overdueTasks', lang)}`, body: a.task.title + more(a.count) }
      case 'tasksDue':
        return { title: `${fmt(a.count)} ${t('student.dash.dueTasks', lang)}`, body: a.task.title + more(a.count) }
      case 'feeOverdue':
      case 'feeDue':
        return { title: `${t('student.dash.feeDue', lang)} ${formatMoney(a.amount, lang)}`, body: monthLabel(a.month, a.year, lang) }
      case 'examToday':
        return {
          title: t('student.dash.examToday', lang),
          body: [a.paper.subject_name ?? a.paper.exam_name, formatClock(a.paper.start_time, lang), a.paper.room_name]
            .filter(Boolean)
            .join(' · '),
        }
      case 'examSoon':
        return {
          title: t('student.dash.examSoon', lang),
          body: `${a.paper.subject_name ?? a.paper.exam_name} · ${formatDate(a.paper.exam_date, lang)}`,
        }
      case 'urgentNotice':
        return { title: t('student.dash.urgentNotice', lang), body: a.notice.title + more(a.count) }
      case 'leaveRejected':
        return { title: t('student.dash.leaveRejected', lang), body: range(a.leave) + more(a.count) }
      case 'leavePending':
        return { title: t('student.dash.leavePending', lang), body: range(a.leave) + more(a.count) }
      case 'attendanceLow':
        return { title: t('student.dash.attendanceLow', lang), body: `${fmt(a.percent)}%` }
      case 'questionWaiting':
        return { title: t('student.dash.questionWaiting', lang), body: a.message.subject + more(a.count) }
      case 'newNotices':
        return { title: `${fmt(a.count)} ${t('student.dash.newNotices', lang)}` }
    }
  }
  const alerts: Alert[] = buildStudentAlerts({
    today,
    now,
    tasks,
    fees: feeRows,
    exams: examRows,
    notices: feed.notices,
    unread: feed.unread,
    leaves: (leaveRes.data ?? []) as AlertLeave[],
    messages: (messageRes.data ?? []) as AlertMessage[],
    attendancePercent: percent,
  }).map((a) => ({
    tone: a.tone,
    ...alertText(a),
    action: { href: a.href, label: t('student.dash.open', lang) },
  }))

  const upcoming = buildStudentUpcoming({ exams: examRows, offDays: routine.offDays, tasks }, today, {
    lang,
    holidayTitle: t('upcoming.holidayDefault', lang),
    dueDetail: t('student.taskDue', lang),
  })

  // Leave and Ask are forms, and both are switched off while the school's
  // subscription is lapsed, so a chip to them would lead to a dead form.
  const quickActions: QuickAction[] = [
    ...(readOnly
      ? []
      : [
          { href: '/student/leave#new-leave', label: t('student.dash.requestLeave', lang), icon: <Icon name="attendance" className="size-4" /> },
          { href: '/student/questions#ask', label: t('student.dash.askQuestion', lang), icon: <Icon name="chat" className="size-4" /> },
        ]),
    {
      href: '/student/tasks',
      // The count goes in the label: QuickAction.count prints ASCII digits.
      label: [t('student.dash.homework', lang), taskCounts.pending ? fmt(taskCounts.pending) : ''].filter(Boolean).join(' '),
      icon: <Icon name="classes" className="size-4" />,
    },
    { href: '/student/routine', label: t('student.nav.routine', lang), icon: <CalendarDays className="size-4" /> },
    { href: '/student/fees', label: t('student.nav.fees', lang), icon: <Icon name="fees" className="size-4" /> },
  ].map((a, i) => ({ ...a, primary: i === 0 }))

  const todayLabel = new Intl.DateTimeFormat(localeOf(lang), {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${today}T00:00:00Z`))
  const subtitle = [
    [student.class_name, student.section].filter(Boolean).join(' - '),
    student.roll_number !== null ? `${t('student.home.roll', lang)} ${fmt(student.roll_number)}` : '',
    // An identifier, not a count: printed as issued.
    student.student_no ?? '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <main className="w-full px-gutter pt-section pb-16">
      <PageHeader
        title={student.full_name}
        crumbs={{ lang, items: [{ label: t('student.nav.home', lang) }] }}
        subtitle={subtitle}
        badge={todayLabel}
      />
      <SectionTabs
        tabs={studentGroupTabs('overview', { notices: feed.unread.size })}
        active="/student"
        lang={lang}
        label={t('student.navGroup.overview', lang)}
      />

      {readOnly && (
        <WarningBanner
          label={t('student.readOnlyLabel', lang)}
          text={t('student.readOnly', lang)}
          href="/student/fees"
          linkLabel={t('student.nav.fees', lang)}
        />
      )}

      {alerts.length ? (
        <AlertStrip title={t('student.dash.needsNow', lang)} alerts={alerts} />
      ) : (
        <Card tone="mint" className="mb-section">
          <h2 className="font-bold text-mint-deep">{t('student.dash.allClear', lang)}</h2>
          <p className="mt-1 text-sm text-muted">{t('student.dash.allClearHint', lang)}</p>
          <p className="mt-1 flex flex-wrap gap-x-5">
            {(['tasks', 'routine'] as const).map((k) => (
              <Link
                key={k}
                href={`/student/${k}`}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-600 hover:underline"
              >
                {t(`student.nav.${k}`, lang)} <span aria-hidden className="ml-1">→</span>
              </Link>
            ))}
          </p>
        </Card>
      )}

      <StatGrid>
        <StatCard
          icon={<Icon name="attendance" className="size-5" />}
          tone={attTone}
          label={t('student.dash.attendanceThisMonth', lang)}
          value={percent === null ? '—' : `${fmt(percent)}%`}
          note={
            percent === null
              ? t('student.attNoRecords', lang)
              : `${fmt(presentDays)} / ${fmt(presentDays + absentDays)} ${t('student.dash.daysPresent', lang)}`
          }
          action={{ href: '/student/attendance', label: t('dash.attendanceReport', lang) }}
        />
        <StatCard
          icon={<Icon name="fees" className="size-5" />}
          tone={fee.tone}
          label={t('student.dash.feeStatus', lang)}
          value={feeRows.length ? formatMoney(fee.due, lang) : '—'}
          note={
            !feeRows.length
              ? t('student.dash.noFeeRecord', lang)
              : fee.monthsDue
                ? `${fmt(fee.monthsDue)} ${t('student.dash.monthsDue', lang)}`
                : t('student.dash.allPaid', lang)
          }
          action={{ href: '/student/fees', label: t('student.dash.viewFees', lang) }}
        />
        <StatCard
          icon={<Icon name="classes" className="size-5" />}
          tone={taskCounts.overdue ? 'alert' : taskCounts.dueSoon ? 'sun' : 'mint'}
          label={t('student.dash.homework', lang)}
          value={fmt(taskCounts.pending)}
          note={
            taskCounts.overdue
              ? `${fmt(taskCounts.overdue)} ${t('student.dash.overdueNote', lang)}`
              : taskCounts.dueSoon
                ? `${fmt(taskCounts.dueSoon)} ${t('student.dash.dueTasks', lang)}`
                : t('student.noTasks', lang)
          }
          action={{ href: '/student/tasks', label: t('dash.viewAll', lang) }}
        />
        {/* Raw marks and rank only. A grade, GPA or pass/fail needs the grading
            scheme, which a student cannot read (#702). */}
        <StatCard
          icon={<Icon name="exams" className="size-5" />}
          tone={latest.state === 'none' ? 'sky' : 'brand'}
          label={t('student.dash.latestResult', lang)}
          value={latest.state === 'ok' ? `${fmt(latest.obtained)} / ${fmt(latest.full)}` : '—'}
          note={
            latest.state === 'none'
              ? t('student.noResults', lang)
              : [
                  latest.examName,
                  latest.state === 'incomplete'
                    ? t('exams.incomplete', lang)
                    : rank && `${t('student.rank', lang)} ${fmt(rank.rank)} / ${fmt(rank.out_of)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')
          }
          action={{
            href: latest.state === 'none' ? '/student/results' : `/student/results/${latest.examId}`,
            label: t('student.nav.results', lang),
          }}
        />
      </StatGrid>

      <QuickActions title={t('student.dash.quickTitle', lang)} actions={quickActions} />

      <div className="mt-section grid gap-grid lg:grid-cols-3">
        <div className="lg:col-span-2">
          <WorkflowCard icon={<CalendarClock className="size-5" />} title={t('student.dash.todayRoutine', lang)}>
            {todayPlan.kind === 'classes' ? (
              <PeriodList plan={todayPlan} lang={lang} />
            ) : (
              <EmptyDay plan={todayPlan} lang={lang} />
            )}
            {/* An unpublished routine is already said once above; a second
                copy for tomorrow would only repeat it. */}
            {(todayPlan.kind !== 'no-routine' || tomorrowPlan.kind !== 'no-routine') && (
              <p className="mb-4 border-t border-line pt-3 text-xs text-muted">
                <span className="font-semibold">{t('student.dash.tomorrowLine', lang)}:</span>{' '}
                {tomorrowPlan.kind === 'classes'
                  ? `${fmt(tomorrowPlan.periods.length)} ${t('student.dash.classesCount', lang)}, ${t('student.dash.firstClass', lang)} ${tomorrowPlan.periods[0].subject_name ?? '—'}`
                  : emptyDayMessage(tomorrowPlan, lang)}
              </p>
            )}
            <ViewAll href="/student/routine" lang={lang} />
          </WorkflowCard>
        </div>

        <div className="flex flex-col gap-grid">
          <WorkflowCard icon={<CalendarDays className="size-5" />} title={t('student.dash.upcoming', lang)}>
            <UpcomingList items={upcoming} lang={lang} today={today} />
          </WorkflowCard>
          <WorkflowCard icon={<Icon name="notices" className="size-5" />} title={t('student.dash.latestNotices', lang)}>
            <NoticeRows notices={feed.notices} unread={feed.unread} lang={lang} />
            <ViewAll href="/student/notices" lang={lang} />
          </WorkflowCard>
        </div>
      </div>
    </main>
  )
}
