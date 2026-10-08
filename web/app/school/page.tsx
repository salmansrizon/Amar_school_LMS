import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarClock, LayoutGrid } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, formatNumber, formatDate, localeOf, type Lang } from '@/lib/i18n'
import { canOpenScreen, type ScreenKey } from '@/lib/auth/screens'
import { getSchoolContext } from '@/lib/school/context'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { applyGlobalYearFilterToStudents } from '@/lib/school/year-filter'
import { SCHOOL_MODULES, SCHOOL_QUICK_ACTIONS, flattenSchoolModules } from '@/lib/school-nav'
import { Icon } from '@/components/school-icons'
import { UpcomingList } from '@/components/upcoming-list'
import { DashboardChecklist } from '@/components/dashboard-checklist'
import {
  attendanceToday,
  isSubscriptionActive,
  buildUpcoming,
  buildDashAlerts,
  unmarkedOfferings,
  type AttendanceToday,
  type DashAlertKind,
} from '@/lib/dashboard'
import { daysLeft, isDaysLeftDanger, countdownKind } from '@/lib/subscription'
import { hubSummary } from '@/lib/student/hub-source'
import { loadSchoolSmsCredit } from '@/lib/sms/credit'
import { pendingApprovalsInReach } from '@/lib/school/approvals-reach'
import type { ActivityChecklistItem, ChecklistTicks } from '@/lib/institute'
import { PageHeader } from '@/components/ui/page'
import {
  StatCard,
  StatGrid,
  AlertStrip,
  QuickActions,
  WorkflowCard,
  type Alert,
  type QuickAction,
} from '@/components/ui/widgets'

// School Owner / Staff dashboard home (map 013 O1, new_ui 01-overview):
// header → "needs attention" strip → 4 stat cards → today's quick steps →
// daily checklist → upcoming events | all modules.

// Supabase REST caps a request at 1,000 rows. The "classes with no attendance"
// alert pages students + today's marks; past MAX_PAGES it is not computed.
// ponytail: 5-page cap (5,000 students); an RPC if a school ever outgrows it.
const PAGE = 1000
const MAX_PAGES = 5
async function allRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[] | null> {
  const rows: T[] = []
  for (let p = 0; p < MAX_PAGES; p++) {
    const { data } = await query(p * PAGE, p * PAGE + PAGE - 1)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
  return null
}

const ALERT_TEXT: Record<DashAlertKind, { title: Parameters<typeof t>[0]; action: Parameters<typeof t>[0] }> = {
  approvals: { title: 'dash.alertApprovals', action: 'dash.actReview' },
  corrections: { title: 'hub.dashCorrections', action: 'dash.actReview' },
  questions: { title: 'hub.dashQuestions', action: 'dash.actReview' },
  attendance: { title: 'dash.alertNoAttendance', action: 'dash.actTakeAttendance' },
  sms: { title: 'dash.alertSmsLow', action: 'dash.actRecharge' },
}

// The same string the page heading shows.
export async function generateMetadata(): Promise<Metadata> {
  const { schoolName } = await getSchoolContext()
  return { title: schoolName ?? t('home.school', await currentLang()) }
}

export default async function SchoolHome() {
  const lang: Lang = await currentLang()
  const {
    supabase,
    role,
    userId,
    schoolId,
    schoolName,
    subscriptionExpiresAt,
    subscriptionStatus,
    grants,
    shiftSelection,
    weeklyOffDays,
    academicYearSelection,
  } = await getSchoolContext()
  const can = (s: ScreenKey) => canOpenScreen(role, grants, s)

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const monthStart = `${today.slice(0, 7)}-01`
  const todayDow = now.getUTCDay()

  // Total students uses the Students page's definition: active Students inside
  // the caller's Global Academic Year Selection (ADR 0023). Counting every
  // active Student here made the card disagree with the list it links to.
  const [studentCountQuery, newThisMonthQuery] = await Promise.all([
    applyGlobalYearFilterToStudents(
      supabase,
      supabase.from('students').select('*', { count: 'exact', head: true }).is('archived_at', null),
      academicYearSelection,
    ),
    applyGlobalYearFilterToStudents(
      supabase,
      supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .is('archived_at', null)
        .gte('created_at', monthStart),
      academicYearSelection,
    ),
  ])

  const [
    { count: studentCount },
    { count: newThisMonth },
    { count: employeeCount },
    { count: approvalCount },
    { data: upcomingExams },
    { data: upcomingHolidays },
    { data: todaySlots },
    { data: subjectRows },
    { data: classRows },
    { data: checklistRow },
    { data: checklistItemRows },
    hub,
    sms,
  ] = await Promise.all([
    studentCountQuery,
    newThisMonthQuery,
    supabase.from('employee_card').select('*', { count: 'exact', head: true }).is('archived_at', null),
    // #689: the Owner keeps the head count; a Staff User counts only the
    // approvals in their reach, the same list the inbox shows them.
    role === 'school_owner'
      ? supabase.from('workflow_instances').select('*', { count: 'exact', head: true }).eq('status', 'in_progress')
      : pendingApprovalsInReach(supabase, { role, userId, grants }).then((rows) => ({ count: rows.length })),
    supabase
      .from('exams')
      .select('id, name, start_date')
      .gte('start_date', today)
      .order('start_date', { ascending: true })
      .limit(6),
    supabase.from('off_days').select('day, label').gte('day', today).order('day', { ascending: true }).limit(6),
    supabase.from('routine_slots').select('class_offering_id, period, subject_id').eq('day_of_week', todayDow).order('period').limit(8),
    supabase.from('subjects').select('id, name'),
    supabase.from('class_offerings').select('id, name'),
    supabase.from('daily_checklists').select('ticks').eq('checklist_date', today).maybeSingle(),
    supabase
      .from('activity_checklist_items')
      .select('id, label_bn, label_en, sort_order')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    // Messages & Requests backlog (#510): RLS-scoped, so a teacher sees her own.
    hubSummary(supabase),
    // null when the school is not on prepaid SMS metering — then no alert.
    loadSchoolSmsCredit(supabase, schoolId),
  ])

  const checklistItems = (checklistItemRows ?? []) as ActivityChecklistItem[]
  const todayTicks = (checklistRow?.ticks as ChecklistTicks | undefined) ?? null

  const totalStudents = studentCount ?? 0

  // Classes with no attendance today — skipped on an off day, and for callers
  // who cannot open attendance (the alert would have no way to fix it). The
  // card's present-rate reads the same data, but only over classes whose
  // register was taken (attendanceToday), never over the whole school.
  const offToday = weeklyOffDays.includes(todayDow) || (upcomingHolidays ?? []).some((h) => h.day === today)
  let unmarked: string[] = []
  let attToday: AttendanceToday | null = null
  if (can('attendance')) {
    const [students, records, notes] = await Promise.all([
      allRows((from, to) =>
        supabase
          .from('students')
          .select('id, student_enrollments!students_current_enrollment_id_fkey(class_offering_id)')
          .is('archived_at', null)
          .order('id')
          .range(from, to),
      ),
      allRows<{ person_id: string }>((from, to) =>
        supabase
          .from('attendance_records')
          .select('person_id')
          .eq('person_type', 'student')
          .eq('att_date', today)
          .order('person_id')
          .range(from, to),
      ),
      allRows<{ person_id: string }>((from, to) =>
        supabase
          .from('attendance_absence_notes')
          .select('person_id')
          .eq('person_type', 'student')
          .eq('att_date', today)
          .order('person_id')
          .range(from, to),
      ),
    ])
    if (students && records && notes) {
      // The FK embed is to-one at runtime (an object), though typed as an array.
      const placedStudents = students.map((s) => ({
        id: s.id as string,
        offeringId:
          (s.student_enrollments as unknown as { class_offering_id: string | null } | null)?.class_offering_id ?? null,
      }))
      const markedIds = new Set([...records, ...notes].map((r) => r.person_id))
      if (!offToday) unmarked = unmarkedOfferings(placedStudents, markedIds)
      attToday = attendanceToday(placedStudents, new Set(records.map((r) => r.person_id)), markedIds)
    }
  }

  const subjectName = new Map((subjectRows ?? []).map((s) => [s.id, s.name]))
  const className = new Map((classRows ?? []).map((c) => [c.id, c.name]))
  const upcoming = buildUpcoming(
    {
      exams: upcomingExams ?? [],
      holidays: (upcomingHolidays ?? []).map((h) => ({ day: h.day, title: h.label || t('upcoming.holidayDefault', lang) })),
      classesToday: (todaySlots ?? []).map((s) => ({
        title: subjectName.get(s.subject_id) ?? t('upcoming.class', lang),
        detail: [className.get(s.class_offering_id), `${t('routine.period', lang)} ${s.period}`].filter(Boolean).join(' · '),
      })),
    },
    today,
  )

  const fmt = (n: number) => formatNumber(n, lang)
  const shortDate = (d: string) => formatDate(d, lang)
  const dateLocale = localeOf(lang)
  const todayLabel = new Intl.DateTimeFormat(dateLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(today + 'T00:00:00Z'))

  const alerts: Alert[] = buildDashAlerts({
    approvals: approvalCount ?? 0,
    corrections: hub.corrections ?? 0,
    questions: hub.questions ?? 0,
    unmarkedClasses: unmarked.length,
    sms,
    canAttendance: can('attendance'),
    canSms: can('sms'),
  }).map((a) => ({
    tone: a.tone,
    title: `${fmt(a.count)} ${t(ALERT_TEXT[a.kind].title, lang)}`,
    body:
      a.kind === 'attendance'
        ? unmarked.slice(0, 3).map((id) => className.get(id) ?? '').filter(Boolean).join(', ') +
          (unmarked.length > 3 ? ' …' : '')
        : a.kind === 'sms'
          ? t(a.count <= 0 ? 'sms.balanceEmpty' : 'sms.lowBalance', lang)
          : undefined,
    action: { href: a.href, label: t(ALERT_TEXT[a.kind].action, lang) },
  }))

  const quickActions: QuickAction[] = SCHOOL_QUICK_ACTIONS.filter((q) => can(q.screen)).map((q, i) => ({
    href: q.href,
    label: t(q.labelKey, lang),
    icon: <Icon name={q.screen} className="size-4" />,
    primary: i === 0,
  }))
  if (can('approvals'))
    quickActions.push({
      href: '/school/approvals',
      label: t('dash.qaApprovals', lang),
      icon: <Icon name="notices" className="size-4" />,
      count: approvalCount ?? 0,
    })

  // Subscription: status comes from school_subscription_status (via context);
  // fall back to the expiry date when the RPC returned nothing.
  const subState =
    subscriptionStatus ?? (isSubscriptionActive(subscriptionExpiresAt, now) ? 'active' : 'expired')
  const subLabel =
    subState === 'trial' ? t('dash.subTrial', lang) : subState === 'expired' ? t('dash.subExpired', lang) : t('dash.subActive', lang)

  // Days-left countdown (issue: dashboard subscription card), in the School's
  // own calendar day (Asia/Dhaka) rather than the server's UTC clock. `null`
  // when no expiry is on record at all (an open-ended trial).
  const subDaysLeft = subscriptionExpiresAt ? daysLeft(subscriptionExpiresAt, now) : null
  const subDanger = subState === 'expired' || (subDaysLeft !== null && isDaysLeftDanger(subDaysLeft))
  const subTone = subDanger ? 'alert' : 'mint'
  const subCountdown =
    subDaysLeft === null
      ? null
      : countdownKind(subDaysLeft) === 'left'
        ? `${fmt(subDaysLeft)} ${t(subDaysLeft === 1 ? 'dash.subDayLeft' : 'dash.subDaysLeft', lang)}`
        : countdownKind(subDaysLeft) === 'today'
          ? t('dash.subExpiresToday', lang)
          : [
              t('dash.subExpiredPrefix', lang),
              fmt(-subDaysLeft),
              t(subDaysLeft === -1 ? 'dash.subExpiredDayAgo' : 'dash.subExpiredDaysAgo', lang),
            ]
              .filter(Boolean)
              .join(' ')
  const subNote = subscriptionExpiresAt
    ? [subCountdown, `${t('dash.subExpires', lang)} ${shortDate(subscriptionExpiresAt)}`]
        .filter(Boolean)
        .join(' · ')
    : t('dash.subNoExpiry', lang)

  // My Classes (#443) is not grant-gated: being the class teacher is the
  // authorization, so the dashboard is where a Class Teacher finds it.
  const { data: myEmployeeId } = await supabase.rpc('app_current_employee_id')
  const myClassCount = myEmployeeId
    ? (
        await applyGlobalShiftFilterToOfferings(
          supabase
            .from('class_offerings')
            .select('id', { count: 'exact', head: true })
            .eq('class_teacher_id', myEmployeeId),
          shiftSelection,
        )
      ).count
    : 0

  const modules = flattenSchoolModules(SCHOOL_MODULES).filter((m) => can(m.screen))

  return (
    <div>
      <PageHeader
        icon="dashboard"
        title={schoolName ?? t('home.school', lang)}
        crumbs={{ lang, items: [{ label: t('dash.dashboard', lang) }] }}
        badge={todayLabel}
        actions={
          myClassCount ? (
            <Link
              href="/school/my-classes"
              className="inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted"
            >
              {t('myClasses.title', lang)} · {fmt(myClassCount)}
            </Link>
          ) : undefined
        }
      />

      <AlertStrip title={t('dash.urgentTitle', lang)} alerts={alerts} />

      <StatGrid>
        {/* Headcounts only for someone who can open the list behind them — a Staff
            User with no grants must not read totals off the dashboard. */}
        {can('students') && (
          <StatCard
            icon={<Icon name="students" className="size-5" />}
            label={t('dash.totalStudents', lang)}
            value={fmt(totalStudents)}
            note={`+${fmt(newThisMonth ?? 0)} ${t('dash.newThisMonth', lang)}`}
            noteTone="mint"
            action={{ href: '/school/students', label: t('dash.openList', lang) }}
          />
        )}
        {can('employees') && (
          <StatCard
            icon={<Icon name="employees" className="size-5" />}
            tone="sky"
            label={t('dash.totalEmployees', lang)}
            value={fmt(employeeCount ?? 0)}
            note={t('dash.teachersStaff', lang)}
            noteTone="muted"
            action={{ href: '/school/employees', label: t('dash.staffDirectory', lang) }}
          />
        )}
        <StatCard
          icon={<Icon name="attendance" className="size-5" />}
          tone={attToday?.rate != null ? (attToday.rate >= 85 ? 'mint' : 'alert') : 'muted'}
          label={t('dash.attendanceToday', lang)}
          value={attToday?.rate != null ? `${fmt(attToday.rate)}%` : '—'}
          progress={attToday?.rate ?? undefined}
          pulse={!alerts.some((al) => al.tone === 'alert') && attToday?.rate != null && attToday.rate < 85}
          note={
            attToday?.rate != null
              ? `${fmt(attToday.present)}/${fmt(attToday.total)} ${t('dash.presentToday', lang)}${
                  attToday.classesPlaced > attToday.classesTaken
                    ? ` · ${fmt(attToday.classesPlaced - attToday.classesTaken)} ${t('dash.classesNotMarked', lang)}`
                    : ''
                }`
              : offToday
                ? t('status.holiday', lang)
                : t('dash.noAttendanceToday', lang)
          }
          noteTone="muted"
          action={can('attendance') ? { href: '/school/attendance', label: t('dash.attendanceReport', lang) } : undefined}
        />
        {/* No subscription page exists yet, so this card carries no action
            link — the countdown (note) turns alert-red in the last 7 days
            or once lapsed, sharing the reminder banner's threshold. */}
        <StatCard
          icon={<Icon name="staff" className="size-5" />}
          tone={subTone}
          label={t('dash.subscription', lang)}
          value={subLabel}
          note={subNote}
        />
      </StatGrid>

      <QuickActions title={t('dash.todaySteps', lang)} actions={quickActions} />

      {/* Activity Checklist (issue #117, template #150). */}
      <DashboardChecklist lang={lang} date={today} items={checklistItems} ticks={todayTicks} />

      <div className="mt-section grid gap-grid lg:grid-cols-3">
        <div className="lg:col-span-2">
          <WorkflowCard icon={<CalendarClock className="size-5" />} title={t('dash.upcoming', lang)}>
            <UpcomingList items={upcoming} lang={lang} today={today} />
            <div className="mt-auto border-t border-line pt-4 text-center">
              <Link
                href="/school/activity"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline max-sm:min-h-11"
              >
                {t('dash.viewAll', lang)}
                <Icon name="chevronRight" className="size-3.5" />
              </Link>
            </div>
          </WorkflowCard>
        </div>

        <WorkflowCard icon={<LayoutGrid className="size-5" />} title={t('dash.modules', lang)}>
          <ul className="divide-y divide-line">
            {modules.map((m) => (
              <li key={m.href}>
                <Link
                  href={m.href}
                  className="flex min-h-11 items-center gap-3 rounded-md px-2 text-sm font-semibold transition-colors hover:bg-paper-muted motion-safe:active:scale-[0.98]"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                    <Icon name={(m.icon ?? m.screen) as React.ComponentProps<typeof Icon>['name']} className="size-4" />
                  </span>
                  <span className="flex-1">{t(m.titleKey, lang)}</span>
                  <Icon name="chevronRight" className="size-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </WorkflowCard>
      </div>
    </div>
  )
}
