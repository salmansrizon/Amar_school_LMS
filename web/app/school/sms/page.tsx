import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { SmsTabs } from './tabs'
import { ComposeForm } from './compose-form'

// Compose SMS (issue #36, PRD §5.7) per ui/school-owner/sms-compose.html.
// Recipients build from class/shift/section, a teacher/staff/management
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

  const [{ data: students }, { data: shifts }, { data: employees }] = await Promise.all([
    supabase.from('students').select('id, full_name, class_name, section, shift_id, guardian_phone'),
    supabase.from('shifts').select('id, name').order('name'),
    supabase.from('employees').select('id, full_name, category, mobile'),
  ])

  const classNames = [...new Set((students ?? []).map((s) => s.class_name).filter(Boolean))] as string[]
  const sections = [...new Set((students ?? []).map((s) => s.section).filter(Boolean))] as string[]
  const categories = [...new Set((employees ?? []).map((e) => e.category).filter(Boolean))] as string[]

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('sms.composeTitle', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>

      <SmsTabs active="/school/sms" lang={lang} />

      <ComposeForm
        lang={lang}
        students={students ?? []}
        employees={employees ?? []}
        classNames={classNames}
        sections={sections}
        categories={categories}
        shifts={shifts ?? []}
      />
    </main>
  )
}
