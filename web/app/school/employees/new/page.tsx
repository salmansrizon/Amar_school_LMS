import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { classCatalogueLabel } from '@/lib/class-catalogue'
import { CreateEmployeeForm } from './create-form'

// Layout per ui/school-owner/employee-create-form.html: carded sections
// Identity / Bank Info / Category & Qualification / Subject & OfficeTime /
// Individual Grace Override, Cancel + Save at the bottom. OfficeTime assignment
// itself stays on the employee detail page (existing multi-officeTime toggles).
//
// Login + Class sections (issue #566) fold in what used to be the separate
// "Add a teacher" flow (#533) — both optional, same submit. The class list
// this page fetches is the same shape the now-deleted second entry point's
// page used to build.
export default async function NewEmployeePage() {
  const lang: Lang = await currentLang()
  const { supabase, shiftSelection } = await getSchoolContext()

  const { data: classes } = await applyGlobalShiftFilterToOfferings(
    supabase
      .from('class_offerings')
      .select('id, name, section, group_department, class_teacher_id')
      .order('created_at'),
    shiftSelection,
  )

  const classOptions = (classes ?? []).map((c) => ({
    id: c.id,
    label: classCatalogueLabel(c),
    // A class that already has a teacher is still offered — reassignment is
    // legitimate — but the Owner is told, because silently replacing a class
    // teacher takes the previous one's students away without telling anybody.
    taken: c.class_teacher_id !== null,
  }))

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('employees.createTitle', lang)}</h1>
        <Link href="/school/employees" aria-label={t('employees.title', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>
      <CreateEmployeeForm lang={lang} classes={classOptions} />
    </div>
  )
}
