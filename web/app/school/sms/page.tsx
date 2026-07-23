import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { SmsTabs } from './tabs'
import { ComposeForm } from './compose-form'
import { COMPOSE_STUDENT_COLUMNS, COMPOSE_EMPLOYEE_COLUMNS } from '@/lib/sms/recipients'

// Compose SMS (issue #36, PRD §5.7) per ui/school-owner/sms-compose.html.
// Recipients build from class/section, a teacher/staff/management
// group, or manual numbers; live character/segment counting client-side.
export default async function SmsComposePage() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  // Withdrawn/archived students and employees are excluded — matches the
  // active-only default every other list screen in this app uses (e.g.
  // app/school/students/page.tsx, app/school/employees/page.tsx).
  const [{ data: students }, { data: employees }] = await Promise.all([
    supabase.from('students').select(COMPOSE_STUDENT_COLUMNS).is('archived_at', null),
    supabase.from('employees').select(COMPOSE_EMPLOYEE_COLUMNS).is('archived_at', null),
  ])

  const classNames = [...new Set((students ?? []).map((s) => s.class_name).filter(Boolean))] as string[]
  const sections = [...new Set((students ?? []).map((s) => s.section).filter(Boolean))] as string[]
  const categories = [...new Set((employees ?? []).map((e) => e.category).filter(Boolean))] as string[]

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('sms.composeTitle', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <SmsTabs active="/school/sms" lang={lang} />

      <ComposeForm
        lang={lang}
        students={students ?? []}
        employees={employees ?? []}
        classNames={classNames}
        sections={sections}
        categories={categories}
      />
    </main>
  )
}
