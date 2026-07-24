import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { CreateEmployeeForm } from './create-form'

// Layout per ui/school-owner/employee-create-form.html: carded sections
// Identity / Bank Info / Category & Qualification / Subject & OfficeTime /
// Individual Grace Override, Cancel + Save at the bottom. OfficeTime assignment
// itself stays on the employee detail page (existing multi-officeTime toggles).
export default async function NewEmployeePage() {
  const lang: Lang = await currentLang()
  await getSchoolContext() // auth + role gate (redirects if not a School member)

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('employees.createTitle', lang)}</h1>
        <Link href="/school/employees" aria-label={t('employees.title', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>
      <CreateEmployeeForm lang={lang} />
    </main>
  )
}
