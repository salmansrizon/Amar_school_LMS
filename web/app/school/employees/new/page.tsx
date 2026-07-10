import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { CreateEmployeeForm } from './create-form'

// Layout per ui/school-owner/employee-create-form.html: carded sections
// Identity / Bank Info / Category & Qualification / Subject & Shift /
// Individual Grace Override, Cancel + Save at the bottom. Shift assignment
// itself stays on the employee detail page (existing multi-shift toggles).
export default async function NewEmployeePage() {
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('employees.createTitle', lang)}</h1>
        <Link href="/school/employees" className="text-sm text-brand-600 hover:underline">
          ← {t('employees.title', lang)}
        </Link>
      </div>
      <CreateEmployeeForm lang={lang} />
    </main>
  )
}
