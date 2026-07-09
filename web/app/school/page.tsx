import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LangSwitch } from '@/components/lang-switch'
import { LogoutButton } from '@/components/logout-button'
import { currentLang } from '@/lib/i18n-server'
import { t, type MessageKey } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'

interface ModuleLink {
  href: string
  labelKey: MessageKey
  icon: string
  ownerOnly?: boolean
}

const MODULES: ModuleLink[] = [
  { href: '/school/students', labelKey: 'students.title', icon: '🎓' },
  { href: '/school/employees', labelKey: 'employees.title', icon: '👥' },
  { href: '/school/attendance', labelKey: 'attendance.title', icon: '✅' },
  { href: '/school/classes', labelKey: 'classes.title', icon: '📚' },
  { href: '/school/classes/routine', labelKey: 'routine.title', icon: '🗓️' },
  { href: '/school/classes/syllabus', labelKey: 'syllabus.title', icon: '📄' },
  { href: '/school/exams', labelKey: 'exams.title', icon: '📝' },
  { href: '/school/fees', labelKey: 'fees.title', icon: '💳' },
  { href: '/school/sms', labelKey: 'sms.title', icon: '✉️' },
  { href: '/school/staff', labelKey: 'staff.title', icon: '🔑', ownerOnly: true },
]

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-paper p-4 shadow-card">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
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
    .select('role, full_name, school_id')
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
      .select('id, full_name, class_name, section, roll_number, created_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const school = schoolRes.data
  const expiry = school?.subscription_expires_at as string | null | undefined
  // Trial = no expiry set; else Active/Expired by date (mirrors schools-list).
  let subKey: MessageKey = 'schools.trial'
  let subTone = 'bg-sky-soft text-sky-deep'
  let subDetail = t('dash.noExpiry', lang)
  if (expiry) {
    // Compare dates, not instants: expiry on/after today counts as active.
    const active = expiry.slice(0, 10) >= today
    subKey = active ? 'schools.active' : 'schools.expired'
    subTone = active ? 'bg-mint-soft text-mint-deep' : 'bg-alert-soft text-alert-deep'
    subDetail = new Date(expiry).toLocaleDateString()
  }

  const modules = MODULES.filter((m) => !m.ownerOnly || profile.role === 'school_owner')
  const recent = recentRes.data ?? []

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-line bg-ink px-4 py-3 text-white">
        <div className="flex items-center gap-2 font-extrabold">
          <span className="flex size-7 items-center justify-center rounded-sm bg-brand-500 text-sm font-bold">A</span>
          {t('app.name', lang)}
        </div>
        <div className="flex items-center gap-3">
          <LangSwitch lang={lang} />
          <LogoutButton label={t('shell.logout', lang)} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <div className="mb-5">
          <h1 className="text-2xl font-extrabold">{school?.name ?? t('home.school', lang)}</h1>
          <p className="text-sm text-muted">
            {t('dash.subtitle', lang)} · {t('shell.welcome', lang)}, {profile.full_name ?? user.email}
          </p>
        </div>

        {/* KPIs */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label={t('dash.students', lang)} value={studentsCount.count ?? 0} />
          <KpiCard label={t('dash.employees', lang)} value={employeesCount.count ?? 0} />
          <KpiCard
            label={t('dash.attendanceToday', lang)}
            value={attendanceToday.count ?? 0}
            sub={t('dash.present', lang)}
          />
          <div className="rounded-lg border border-line bg-paper p-4 shadow-card">
            <p className="text-xs font-semibold text-muted">{t('dash.subscription', lang)}</p>
            <p className="mt-2">
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${subTone}`}>{t(subKey, lang)}</span>
            </p>
            <p className="mt-1.5 text-xs text-muted">
              {t('schools.expiry', lang)}: {subDetail}
            </p>
          </div>
        </div>

        {/* Modules */}
        <h2 className="mb-3 text-sm font-bold text-muted">{t('dash.modules', lang)}</h2>
        <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {modules.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="flex flex-col items-center gap-2 rounded-lg border border-line bg-paper p-4 text-center shadow-card transition hover:border-brand-300 hover:shadow-modal"
            >
              <span className="text-2xl" aria-hidden>{m.icon}</span>
              <span className="text-sm font-semibold">{t(m.labelKey, lang)}</span>
            </Link>
          ))}
        </div>

        {/* Recent admissions */}
        <div className="rounded-lg border border-line bg-paper p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">{t('dash.recentAdmissions', lang)}</h2>
            <Link href="/school/students" className="text-sm font-semibold text-brand-600 hover:underline">
              {t('dash.viewAll', lang)} →
            </Link>
          </div>
          {!recent.length ? (
            <p className="text-sm text-muted">{t('students.none', lang)}</p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/school/students/${s.id}`}
                    className="flex items-center justify-between gap-2 py-2 text-sm hover:text-brand-600"
                  >
                    <span className="flex items-center gap-2">
                      {s.roll_number != null && (
                        <span className="inline-block min-w-8 rounded bg-paper-muted px-1.5 py-0.5 text-center text-xs font-semibold text-muted">
                          {s.roll_number}
                        </span>
                      )}
                      <span className="font-medium">{s.full_name}</span>
                    </span>
                    <span className="text-muted">{[s.class_name, s.section].filter(Boolean).join(' — ')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
