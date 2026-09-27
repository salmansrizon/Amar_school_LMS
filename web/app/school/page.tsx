import Link from 'next/link'
import { CalendarClock, LayoutGrid } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { canOpenScreen, type ScreenKey } from '@/lib/auth/screens'
import { getSchoolContext } from '@/lib/school/context'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { SCHOOL_MODULES, SCHOOL_QUICK_ACTIONS, flattenSchoolModules, schoolNavGroupForScreen } from '@/lib/school-nav'
import { Icon } from '@/components/school-icons'
import { UpcomingList } from '@/components/upcoming-list'
import { DashboardChecklist } from '@/components/dashboard-checklist'
import {
  attendanceRate,
  isSubscriptionActive,
  buildUpcoming,
  buildDashAlerts,
  unmarkedOfferings,
  type DashAlertKind,
} from '@/lib/dashboard'
import { hubSummary } from '@/lib/student/hub-source'
import { loadSchoolSmsCredit } from '@/lib/sms/credit'
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

export default async function SchoolHome() {
  const lang: Lang = await currentLang()
  const {
    supabase,
    role,
    schoolId,
    schoolName,
    subscriptionExpiresAt,
    subscriptionStatus,
    grants,
    shiftSelection,
    weeklyOffDays,
  } = await getSchoolContext()
  const can = (s: ScreenKey) => canOpenScreen(role, grants, s)

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const monthStart = `${today.slice(0, 7)}-01`
  const todayDow = now.getUTCDay()

  const [
    { count: studentCount },
    { count: newThisMonth },
    { count: employeeCount },
    { count: presentCount },
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
    supabase.from('students').select('*', { count: 'exact', head: true }).is('archived_at', null),
    supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .is('archived_at', null)
      .gte('created_at', monthStart),
    supabase.from('employee_card').select('*', { count: 'exact', head: true }).is('archived_at', null),
    supabase
      .from('attendance_records')
      .select('*', { count: 'exact', head: true })
      .eq('person_type', 'student')
      .eq('att_date', today),
    supabase.from('workflow_instances').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
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
  const presentToday = presentCount ?? 0
  const attRate = attendanceRate(presentToday, totalStudents)

  // Classes with no attendance today — skipped on an off day, and for callers
  // who cannot open attendance (the alert would have no way to fix it).
  const offToday = weeklyOffDays.includes(todayDow) || (upcomingHolidays ?? []).some((h) => h.day === today)
  let unmarked: string[] = []
  if (!offToday && can('attendance')) {
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
      unmarked = unmarkedOfferings(
        // The FK embed is to-one at runtime (an object), though typed as an array.
        students.map((s) => ({
          id: s.id as string,
          offeringId:
            (s.student_enrollments as unknown as { class_offering_id: string | null } | null)?.class_offering_id ??
            null,
        })),
        new Set([...records, ...notes].map((r) => r.person_id)),
      )
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

  const numLocale = lang === 'bn' ? 'bn-BD' : 'en-US'
  const fmt = (n: number) => n.toLocaleString(numLocale)
  const dateLocale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const shortDateFmt = new Intl.DateTimeFormat(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' })
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

  // Honesty: only screens the dashboard already loads a number for get a meta
  // line — the same figures already shown in the StatCards above, not a new
  // fetch. fees/notices have no such number loaded on this page, so they omit it.
  const QA_META: Partial<Record<ScreenKey, string>> = {
    students: `+${fmt(newThisMonth ?? 0)} ${t('dash.newThisMonth', lang)}`,
    employees: `${fmt(employeeCount ?? 0)} ${t('dash.teachersStaff', lang)}`,
    attendance: presentToday
      ? `${fmt(presentToday)} ${t('dash.presentToday', lang)}`
      : t('dash.noAttendanceToday', lang),
  }

  const quickActions: QuickAction[] = SCHOOL_QUICK_ACTIONS.filter((q) => can(q.screen)).map((q, i) => {
    const group = schoolNavGroupForScreen(q.screen)
    return {
      href: q.href,
      label: t(q.labelKey, lang),
      icon: <Icon name={q.screen} className="size-4" />,
      primary: i === 0,
      category: group ? t(group.labelKey, lang) : undefined,
      meta: QA_META[q.screen],
    }
  })
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
        <StatCard
          icon={<Icon name="students" className="size-5" />}
          label={t('dash.totalStudents', lang)}
          value={fmt(totalStudents)}
          note={`+${fmt(newThisMonth ?? 0)} ${t('dash.newThisMonth', lang)}`}
          noteTone="mint"
          action={can('students') ? { href: '/school/students', label: t('dash.openList', lang) } : undefined}
        />
        <StatCard
          icon={<Icon name="employees" className="size-5" />}
          tone="sky"
          label={t('dash.totalEmployees', lang)}
          value={fmt(employeeCount ?? 0)}
          note={t('dash.teachersStaff', lang)}
          noteTone="muted"
          action={can('employees') ? { href: '/school/employees', label: t('dash.staffDirectory', lang) } : undefined}
        />
        <StatCard
          icon={<Icon name="attendance" className="size-5" />}
          tone={presentToday ? (attRate >= 85 ? 'mint' : 'alert') : 'muted'}
          label={t('dash.attendanceToday', lang)}
          value={presentToday ? `${attRate.toLocaleString(numLocale)}%` : '—'}
          note={
            presentToday
              ? `${fmt(presentToday)} ${t('dash.presentToday', lang)}`
              : t('dash.noAttendanceToday', lang)
          }
          noteTone="muted"
          action={can('attendance') ? { href: '/school/attendance', label: t('dash.attendanceReport', lang) } : undefined}
        />
        {/* No plan name and no subscription page exist yet, so this card shows
            the status + expiry and carries no action link. */}
        <StatCard
          icon={<Icon name="staff" className="size-5" />}
          tone={subState === 'expired' ? 'alert' : 'mint'}
          label={t('dash.subscription', lang)}
          value={subLabel}
          note={
            subscriptionExpiresAt
              ? `${t('dash.subExpires', lang)} ${shortDateFmt.format(new Date(subscriptionExpiresAt + 'T00:00:00Z'))}`
              : t('dash.subNoExpiry', lang)
          }
          noteTone="muted"
        />
      </StatGrid>

      <QuickActions
        title={t('dash.todaySteps', lang)}
        actions={quickActions}
        openLabel={t('dash.openModule', lang)}
      />

      {/* Activity Checklist (issue #117, template #150). */}
      <DashboardChecklist lang={lang} date={today} items={checklistItems} ticks={todayTicks} />

      <div className="mt-section grid gap-grid lg:grid-cols-3">
        <div className="lg:col-span-2">
          <WorkflowCard icon={<CalendarClock className="size-5" />} title={t('dash.upcoming', lang)}>
            <UpcomingList items={upcoming} lang={lang} today={today} />
            <div className="mt-auto border-t border-line pt-4 text-center">
              <Link
                href="/school/activity"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
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
                  className="flex min-h-11 items-center gap-3 rounded-md px-2 text-sm font-semibold hover:bg-paper-muted"
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
