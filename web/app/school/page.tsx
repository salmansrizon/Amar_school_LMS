import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { canOpenScreen } from '@/lib/auth/screens'
import { getSchoolContext } from '@/lib/school/context'
import { SCHOOL_QUICK_ACTIONS } from '@/lib/school-nav'
import { Icon } from '@/components/school-icons'
import { UpcomingList } from '@/components/upcoming-list'
import { DashboardChecklist } from '@/components/dashboard-checklist'
import { attendanceRate, isSubscriptionActive, buildUpcoming } from '@/lib/dashboard'
import type { ActivityChecklistItem, ChecklistTicks } from '@/lib/institute'
import { Card, type Tone } from '@/components/ui/page'

// School Owner / Staff dashboard home, per ui/school-owner/dashboard.html:
// KPI tiles + (Recent Activity | Quick Actions) split. The module nav lives
// in the persistent sidebar (app/school/layout.tsx + components/school-shell.tsx)
// rather than duplicated here. Replaces the issue #1 placeholder shell.
//
// Dashboard archetype (map #370, gate #372): the shell already hands this page
// bare full width, so the re-lay here is hairline surfaces + the density scale
// + the status rail — the tiles are exactly the "stat cards" the rail spec
// names. Each tile keeps a textual state cue (the value itself, or the hint)
// so the rail is reinforcement, never the only signal.

function StatTile({
  label,
  value,
  hint,
  tone,
  icon,
  valueClass = 'text-ink',
}: {
  label: string
  value: string
  hint?: string
  tone?: Tone
  icon: React.ComponentProps<typeof Icon>['name']
  valueClass?: string
}) {
  return (
    <Card tone={tone}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
          <Icon name={icon} className="size-5" />
        </span>
      </div>
      <div className={`mt-3 text-3xl font-extrabold tracking-tight tabular-nums ${valueClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs font-medium text-muted">{hint}</div>}
    </Card>
  )
}

export default async function SchoolHome() {
  const lang: Lang = await currentLang()
  // Shared per-request context (auth/profile/grants/school) — resolved once and
  // reused by the layout, so the dashboard adds no duplicate auth/profile queries.
  const { supabase, email, role, fullName, subscriptionExpiresAt, grants } = await getSchoolContext()

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const todayDow = now.getUTCDay()

  const [
    { count: studentCount },
    { count: employeeCount },
    { data: latestAtt },
    { data: upcomingExams },
    { data: upcomingHolidays },
    { data: todaySlots },
    { data: subjectRows },
    { data: classRows },
    { data: checklistRow },
    { data: checklistItemRows },
  ] = await Promise.all([
    supabase.from('students').select('*', { count: 'exact', head: true }).is('archived_at', null),
    supabase.from('employee_card').select('*', { count: 'exact', head: true }).is('archived_at', null),
    supabase
      .from('attendance_records')
      .select('att_date')
      .eq('person_type', 'student')
      .order('att_date', { ascending: false })
      .limit(1),
    supabase
      .from('exams')
      .select('id, name, start_date')
      .gte('start_date', today)
      .order('start_date', { ascending: true })
      .limit(6),
    supabase.from('off_days').select('day, label').gte('day', today).order('day', { ascending: true }).limit(6),
    supabase.from('routine_slots').select('class_id, period, subject_id').eq('day_of_week', todayDow).order('period').limit(8),
    supabase.from('subjects').select('id, name'),
    supabase.from('classes').select('id, name'),
    supabase
      .from('daily_checklists')
      .select('ticks')
      .eq('checklist_date', today)
      .maybeSingle(),
    supabase
      .from('activity_checklist_items')
      .select('id, label_bn, label_en, sort_order')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  const checklistItems = (checklistItemRows ?? []) as ActivityChecklistItem[]
  const todayTicks = ((checklistRow?.ticks as ChecklistTicks | undefined) ?? null)

  const totalStudents = studentCount ?? 0
  const totalEmployees = employeeCount ?? 0

  // Attendance snapshot for the most recent recorded day.
  const attDate: string | null = latestAtt?.[0]?.att_date ?? null
  let presentToday = 0
  if (attDate) {
    const { count } = await supabase
      .from('attendance_records')
      .select('*', { count: 'exact', head: true })
      .eq('person_type', 'student')
      .eq('att_date', attDate)
    presentToday = count ?? 0
  }
  const attRate = attendanceRate(presentToday, totalStudents)

  const subActive = isSubscriptionActive(subscriptionExpiresAt, now)

  const subjectName = new Map((subjectRows ?? []).map((s) => [s.id, s.name]))
  const className = new Map((classRows ?? []).map((c) => [c.id, c.name]))
  const upcoming = buildUpcoming(
    {
      exams: upcomingExams ?? [],
      holidays: (upcomingHolidays ?? []).map((h) => ({ day: h.day, title: h.label || t('upcoming.holidayDefault', lang) })),
      classesToday: (todaySlots ?? []).map((s) => ({
        title: subjectName.get(s.subject_id) ?? t('upcoming.class', lang),
        detail: [className.get(s.class_id), `${t('routine.period', lang)} ${s.period}`].filter(Boolean).join(' · '),
      })),
    },
    today,
  )

  const numLocale = lang === 'bn' ? 'bn-BD' : 'en-US'
  const shortDateFmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short' })

  const quickActions = SCHOOL_QUICK_ACTIONS.filter((q) => canOpenScreen(role, grants, q.screen))

  // My Classes (#443) is not in the nav, because it is not grant-gated: being
  // the class teacher is the authorization. So the dashboard is where a Class
  // Teacher finds it, and only when they actually are one. Most logins are not
  // linked to an Employee at all, and those pay one query, not two.
  const { data: myEmployeeId } = await supabase.rpc('app_current_employee_id')
  const myClassCount = myEmployeeId
    ? (
        await supabase
          .from('classes')
          .select('id', { count: 'exact', head: true })
          .eq('class_teacher_id', myEmployeeId)
      ).count
    : 0

  return (
    <div>
      <div className="mb-section">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-600">{t('shell.welcome', lang)}</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{t('home.school', lang)}</h1>
        <p className="mt-1 text-sm text-muted">{fullName || email}</p>
        {!!myClassCount && (
          <Link
            href="/school/my-classes"
            className="mt-3 inline-flex rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('myClasses.title', lang)} · {myClassCount}
          </Link>
        )}
      </div>

      {/* KPI tiles — stat cards, so each carries the rail. */}
      <div className="grid grid-cols-2 gap-grid lg:grid-cols-4">
        <StatTile
          icon="students"
          label={t('dash.totalStudents', lang)}
          value={totalStudents.toLocaleString(numLocale)}
          hint={t('dash.activeStudents', lang)}
          valueClass="text-brand-600"
          tone="brand"
        />
        <StatTile
          icon="employees"
          label={t('dash.totalEmployees', lang)}
          value={totalEmployees.toLocaleString(numLocale)}
          hint={t('dash.teachersStaff', lang)}
          tone="muted"
        />
        <StatTile
          icon="attendance"
          label={t('dash.attendanceToday', lang)}
          value={attDate ? `${attRate.toLocaleString(numLocale)}%` : '—'}
          hint={
            attDate
              ? `${presentToday.toLocaleString(numLocale)} · ${shortDateFmt.format(new Date(attDate + 'T00:00:00Z'))}`
              : t('dash.noAttendanceToday', lang)
          }
          tone={attDate ? (attRate >= 85 ? 'mint' : 'alert') : 'muted'}
          valueClass={attDate && attRate < 85 ? 'text-alert-deep' : 'text-ink'}
        />
        <StatTile
          icon="staff"
          label={t('dash.subscription', lang)}
          value={subActive ? t('dash.subActive', lang) : t('dash.subExpired', lang)}
          hint={
            subscriptionExpiresAt
              ? `${t('dash.subExpires', lang)} ${shortDateFmt.format(new Date(subscriptionExpiresAt + 'T00:00:00Z'))}`
              : t('dash.subNoExpiry', lang)
          }
          tone={subActive ? 'mint' : 'alert'}
          valueClass={subActive ? 'text-brand-700' : 'text-alert-deep'}
        />
      </div>

      {/* Activity Checklist (issue #117, template #150): today's ticks over the
          editable item template as a checkable card grid, unchecked = due. */}
      <DashboardChecklist lang={lang} date={today} items={checklistItems} ticks={todayTicks} />

      {/* Upcoming Activity + Quick Actions, per the mockup's dash-split (2fr/1fr) */}
      <div className="mt-section grid gap-grid lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-grid flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t('dash.upcoming', lang)}</h2>
            <Link
              href="/school/activity"
              className="inline-flex items-center gap-1 rounded-md px-1 text-xs font-semibold text-brand-600 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              {t('dash.viewAll', lang)}
              <Icon name="chevronRight" className="size-3.5" />
            </Link>
          </div>
          <Card padded={false}>
            <UpcomingList items={upcoming} lang={lang} today={today} />
          </Card>
        </section>

        <section>
          <h2 className="mb-grid text-sm font-bold uppercase tracking-wide text-muted">{t('dash.quickActions', lang)}</h2>
          <div className="flex flex-col gap-2">
            {quickActions.map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className={`flex min-h-11 items-center gap-3 whitespace-nowrap rounded-md px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 ${
                  q.primary
                    ? 'bg-brand-600 text-white hover:bg-brand-700'
                    : 'border border-line-strong bg-paper text-ink hover:border-brand-300 hover:bg-paper-muted'
                }`}
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-md ${
                    q.primary ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-600'
                  }`}
                >
                  <Icon name={q.screen} className="size-4" />
                </span>
                {t(q.labelKey, lang)}
              </Link>
            ))}
            {role === 'school_owner' && (
              <Link
                href="/school/approvals"
                className="flex min-h-11 items-center gap-3 whitespace-nowrap rounded-md border border-line-strong bg-paper px-4 py-3 text-sm font-semibold text-ink transition hover:border-brand-300 hover:bg-paper-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                  <Icon name="notices" className="size-4" />
                </span>
                {t('approvals.title', lang)}
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
