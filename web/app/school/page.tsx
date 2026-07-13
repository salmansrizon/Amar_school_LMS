import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { canOpenScreen } from '@/lib/auth/screens'
import type { Role } from '@/lib/auth/routing'
import { SCHOOL_QUICK_ACTIONS } from '@/lib/school-nav'
import {
  attendanceRate,
  isSubscriptionActive,
  mergeActivity,
  type ActivityType,
} from '@/lib/dashboard'

// School Owner / Staff dashboard home, per ui/school-owner/dashboard.html:
// KPI tiles + (Recent Activity | Quick Actions) split. The module nav lives
// in the persistent sidebar (app/school/layout.tsx + components/school-shell.tsx)
// rather than duplicated here. Replaces the issue #1 placeholder shell.

const ACTIVITY_TONE: Record<ActivityType, string> = {
  admission: 'bg-mint-soft text-mint-deep',
  notice: 'bg-sun-soft text-sun-deep',
  feedback: 'bg-alert-soft text-alert-deep',
}
const ACTIVITY_LABEL: Record<ActivityType, MessageKey> = {
  admission: 'dash.raAdmission',
  notice: 'dash.raNotice',
  feedback: 'dash.raFeedback',
}

function StatTile({ label, value, hint, badge }: { label: string; value: string; hint?: string; badge?: 'ok' | 'warn' }) {
  return (
    <div className="rounded-2xl border border-line/70 bg-paper/92 p-5 shadow-card backdrop-blur">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-extrabold tracking-tight text-ink">{value}</span>
        {badge && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              badge === 'ok' ? 'bg-mint-soft text-mint-deep' : 'bg-alert-soft text-alert-deep'
            }`}
          >
            {badge === 'ok' ? '●' : '!'}
          </span>
        )}
      </div>
      {hint && <div className="mt-1 text-xs font-medium text-muted">{hint}</div>}
    </div>
  )
}

export default async function SchoolHome() {
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, school_id')
    .eq('id', user.id)
    .single()
  if (!profile || (profile.role !== 'school_owner' && profile.role !== 'staff_user')) redirect('/login')
  const role = profile.role as Role

  let grants: string[] = []
  if (role === 'staff_user') {
    const { data: perms } = await supabase.from('staff_permissions').select('screen_key').eq('staff_user_id', user.id)
    grants = (perms ?? []).map((p) => p.screen_key)
  }

  const [
    { count: studentCount },
    { count: employeeCount },
    { data: latestAtt },
    { data: school },
    { data: recentStudents },
    { data: recentNotices },
    { data: recentFeedback },
  ] = await Promise.all([
    supabase.from('students').select('*', { count: 'exact', head: true }).is('archived_at', null),
    supabase.from('employees').select('*', { count: 'exact', head: true }).is('archived_at', null),
    supabase
      .from('attendance_records')
      .select('att_date')
      .eq('person_type', 'student')
      .order('att_date', { ascending: false })
      .limit(1),
    supabase.from('schools').select('name, subscription_expires_at').eq('id', profile.school_id).maybeSingle(),
    supabase
      .from('students')
      .select('full_name, created_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('publications').select('title, created_at').order('created_at', { ascending: false }).limit(5),
    supabase.from('feedback_messages').select('subject, created_at').order('created_at', { ascending: false }).limit(5),
  ])

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

  const subActive = isSubscriptionActive(school?.subscription_expires_at ?? null, new Date())
  const activity = mergeActivity({
    students: recentStudents ?? [],
    notices: recentNotices ?? [],
    feedback: recentFeedback ?? [],
  })

  const numLocale = lang === 'bn' ? 'bn-BD' : 'en-US'
  const dateFmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  const shortDateFmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short' })

  const quickActions = SCHOOL_QUICK_ACTIONS.filter((q) => canOpenScreen(role, grants, q.screen))

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-600">{t('shell.welcome', lang)}</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{t('home.school', lang)}</h1>
        <p className="mt-1 text-sm text-muted">{profile.full_name ?? user.email}</p>
      </div>

      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t('dash.totalStudents', lang)}
          value={totalStudents.toLocaleString(numLocale)}
          hint={t('dash.activeStudents', lang)}
        />
        <StatTile
          label={t('dash.totalEmployees', lang)}
          value={totalEmployees.toLocaleString(numLocale)}
          hint={t('dash.teachersStaff', lang)}
        />
        <StatTile
          label={t('dash.attendanceToday', lang)}
          value={attDate ? `${attRate}%` : '—'}
          hint={
            attDate
              ? `${presentToday.toLocaleString(numLocale)} · ${shortDateFmt.format(new Date(attDate + 'T00:00:00Z'))}`
              : t('dash.noAttendanceToday', lang)
          }
          badge={attDate ? (attRate >= 85 ? 'ok' : 'warn') : undefined}
        />
        <StatTile
          label={t('dash.subscription', lang)}
          value={subActive ? t('dash.subActive', lang) : t('dash.subExpired', lang)}
          hint={
            school?.subscription_expires_at
              ? `${t('dash.subExpires', lang)} ${shortDateFmt.format(new Date(school.subscription_expires_at + 'T00:00:00Z'))}`
              : t('dash.subNoExpiry', lang)
          }
          badge={subActive ? 'ok' : 'warn'}
        />
      </div>

      {/* Recent Activity + Quick Actions, per the mockup's dash-split (2fr/1fr) */}
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t('dash.recentActivity', lang)}</h2>
          <div className="overflow-x-auto rounded-2xl border border-line/70 bg-paper/92 shadow-card backdrop-blur">
            {activity.length === 0 ? (
              <p className="p-6 text-sm text-muted">{t('dash.raNone', lang)}</p>
            ) : (
              <table className="w-full min-w-[32rem] border-collapse">
                <thead>
                  <tr className="border-b border-line/70">
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('dash.raType', lang)}</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('dash.raDescription', lang)}</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('dash.raWhen', lang)}</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((a, i) => (
                    <tr key={i} className="border-b border-line/40 last:border-0">
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ACTIVITY_TONE[a.type]}`}>
                          {t(ACTIVITY_LABEL[a.type], lang)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-ink">
                        {a.type === 'admission'
                          ? `${t('dash.raAdmissionDesc', lang)} — ${a.title}`
                          : a.type === 'feedback'
                            ? `${t('dash.raFeedbackDesc', lang)} — ${a.title}`
                            : a.title}
                      </td>
                      <td className="px-4 py-2 text-sm text-muted">{dateFmt.format(new Date(a.at))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t('dash.quickActions', lang)}</h2>
          <div className="flex flex-col gap-2">
            {quickActions.map((q) => (
              <a
                key={q.href}
                href={q.href}
                className={`rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                  q.primary
                    ? 'bg-brand-500 text-white hover:bg-brand-600'
                    : 'border border-line-strong bg-paper text-ink hover:border-brand-300'
                }`}
              >
                {t(q.labelKey, lang)}
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
