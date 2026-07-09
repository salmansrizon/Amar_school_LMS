import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type MessageKey } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'

function KpiCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-paper p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  )
}

export default async function SchoolHome() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', user.id)
    .single()
  if (!profile || (profile.role !== 'school_owner' && profile.role !== 'staff_user')) redirect('/login')

  const today = new Date().toISOString().slice(0, 10)
  const [studentsCount, employeesCount, attendanceToday, schoolRes, recentRes] = await Promise.all([
    supabase.from('students').select('*', { count: 'exact', head: true }).is('archived_at', null),
    supabase.from('employees').select('*', { count: 'exact', head: true }),
    supabase
      .from('attendance_records')
      .select('*', { count: 'exact', head: true })
      .eq('att_date', today)
      .eq('person_type', 'student'),
    supabase.from('schools').select('name, subscription_expires_at').eq('id', profile.school_id).maybeSingle(),
    supabase
      .from('students')
      .select('id, full_name, class_name, section, roll_number')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  const school = schoolRes.data
  const expiry = school?.subscription_expires_at as string | null | undefined
  let subKey: MessageKey = 'schools.trial'
  let subBadge = 'bg-sky-soft text-sky-deep'
  let subDetail = t('dash.noExpiry', lang)
  if (expiry) {
    const active = expiry.slice(0, 10) >= today
    subKey = active ? 'schools.active' : 'schools.expired'
    subBadge = active ? 'bg-mint-soft text-mint-deep' : 'bg-alert-soft text-alert-deep'
    subDetail = `${t('schools.expiry', lang)}: ${new Date(expiry).toLocaleDateString()}`
  }
  const recent = recentRes.data ?? []

  const quickActions: { href: string; labelKey: MessageKey; primary?: boolean }[] = [
    { href: '/school/students/new', labelKey: 'students.admit', primary: true },
    { href: '/school/classes', labelKey: 'classes.title' },
    { href: '/school/attendance', labelKey: 'dash.qaMarkAttendance' },
    { href: '/school/fees', labelKey: 'dash.qaCollectFee' },
    { href: '/school/sms', labelKey: 'sms.title' },
  ]

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      {/* KPI grid */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t('dash.students', lang)} value={studentsCount.count ?? 0} />
        <KpiCard label={t('dash.employees', lang)} value={employeesCount.count ?? 0} />
        <KpiCard
          label={t('dash.attendanceToday', lang)}
          value={attendanceToday.count ?? 0}
          sub={t('dash.present', lang)}
        />
        <KpiCard
          label={t('dash.subscription', lang)}
          value={<span className={`rounded-full px-3 py-1 text-sm font-bold ${subBadge}`}>{t(subKey, lang)}</span>}
          sub={subDetail}
        />
      </div>

      {/* Recent admissions + Quick actions */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">{t('dash.recentAdmissions', lang)}</h2>
            <Link href="/school/students" className="text-sm font-semibold text-brand-600 hover:underline">
              {t('dash.viewAll', lang)} →
            </Link>
          </div>
          {!recent.length ? (
            <p className="text-sm text-muted">{t('students.none', lang)}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 font-semibold">{t('students.roll', lang)}</th>
                  <th className="py-2 font-semibold">{t('common.name', lang)}</th>
                  <th className="py-2 font-semibold">{t('students.class', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0 hover:bg-paper-muted">
                    <td className="py-2 tabular-nums text-muted">{s.roll_number ?? '—'}</td>
                    <td className="py-2">
                      <Link href={`/school/students/${s.id}`} className="font-medium hover:text-brand-600">
                        {s.full_name}
                      </Link>
                    </td>
                    <td className="py-2 text-muted">{[s.class_name, s.section].filter(Boolean).join(' — ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
          <h2 className="mb-3 font-bold">{t('dash.quickActions', lang)}</h2>
          <div className="flex flex-col gap-2">
            {quickActions.map((qa) => (
              <Link
                key={qa.href}
                href={qa.href}
                className={`rounded-full px-4 py-2 text-center text-sm font-semibold ${
                  qa.primary
                    ? 'bg-brand-500 text-white hover:bg-brand-600'
                    : 'border border-line-strong hover:bg-paper-muted'
                }`}
              >
                {qa.primary ? '+ ' : ''}
                {t(qa.labelKey, lang)}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
