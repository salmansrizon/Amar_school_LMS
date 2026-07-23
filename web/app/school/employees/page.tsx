import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { employeeOfficeTimeNames, filterEmployees } from '@/lib/employees'
import { AddOfficeTimeForm, CategoryGraceForm, DefaultGraceForm } from './employee-controls'
import { selectClass } from '@/components/ui/field'

// Layout per ui/school-owner/employees-list.html: search + category filter,
// table Name | Category | Qualification | OfficeTime | Department | Status | View,
// with Old Employees + New Employee actions. Office-time/grace config
// (global default, per-officeTime, per-category, per-individual override — issue
// #9) stays at the top, unchanged by issue #28.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'
export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>
}) {
  const { q = '', category = '' } = await searchParams
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', user.id)
    .single()
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  if (!me?.school_id || (me.role !== 'school_owner' && me.role !== 'staff_user')) redirect('/login')

  const [
    { data: school },
    { data: officeTimes },
    { data: categoryGrace },
    { data: employees },
    { data: assignments },
  ] = await Promise.all([
    supabase.from('schools').select('default_grace_minutes').eq('id', me.school_id).single(),
    supabase.from('office_times').select('id, name, grace_minutes').order('name'),
    supabase.from('category_grace_minutes').select('category, grace_minutes').order('category'),
    supabase
      .from('employees')
      .select('id, full_name, category, qualification, department, archived_at')
      .is('archived_at', null)
      .order('full_name'),
    supabase.from('employee_office_times').select('employee_id, office_time_id'),
  ])

  const visible = filterEmployees(employees ?? [], q, category)
  const categories = [...new Set((employees ?? []).map((e) => e.category).filter(Boolean))] as string[]
  const dash = <span className="text-muted">—</span>

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('employees.title', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>
      <p className="mb-4 text-xs text-muted">{t('grace.hint', lang)}</p>

      <section className="mb-6 grid gap-4 rounded-lg border border-line bg-paper p-5 shadow-card sm:grid-cols-3">
        <DefaultGraceForm current={school?.default_grace_minutes ?? null} lang={lang} />
        <AddOfficeTimeForm lang={lang} />
        <CategoryGraceForm lang={lang} />
        <div className="text-xs text-muted sm:col-span-3">
          {officeTimes?.map((s) => (
            <span key={s.id} className="mr-3">
              {s.name}: {s.grace_minutes ?? '—'}m
            </span>
          ))}
          {categoryGrace?.map((c) => (
            <span key={c.category} className="mr-3">
              {c.category}: {c.grace_minutes}m
            </span>
          ))}
        </div>
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <form className="flex flex-wrap items-center gap-2" method="get">
          <input
            name="q"
            defaultValue={q}
            placeholder={t('employees.search', lang)}
            className="w-56 rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
          />
          <select name="category" defaultValue={category} className={selectClass()}>
            <option value="">{t('employees.allCategories', lang)}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('classes.filter', lang)}
          </button>
        </form>
        <div className="flex gap-2">
          <Link
            href="/school/employees/archive"
            className="rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('employees.oldEmployees', lang)}
          </Link>
          <Link
            href="/school/employees/new"
            className="rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
          >
            + {t('employees.add', lang)}
          </Link>
        </div>
      </div>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        {!visible.length ? (
          <p className="text-sm text-muted">{t('employees.none', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className={thClass}>{t('employees.name', lang)}</th>
                  <th className={thClass}>{t('employees.category', lang)}</th>
                  <th className={thClass}>{t('employees.qualification', lang)}</th>
                  <th className={thClass}>{t('employees.officeTimes', lang)}</th>
                  <th className={thClass}>{t('employees.department', lang)}</th>
                  <th className={thClass}>{t('employees.status', lang)}</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr key={e.id} className="border-b border-line">
                    <td className={`${tdClass} font-medium`}>{e.full_name}</td>
                    <td className={tdClass}>{e.category ?? dash}</td>
                    <td className={tdClass}>{e.qualification ?? dash}</td>
                    <td className={tdClass}>{employeeOfficeTimeNames(e.id, assignments ?? [], officeTimes ?? []) ?? dash}</td>
                    <td className={tdClass}>{e.department ?? dash}</td>
                    <td className={tdClass}>
                      <span className="rounded-full bg-mint-soft px-2 py-0.5 text-xs font-semibold text-mint-deep">
                        {t('employees.active', lang)}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <Link href={`/school/employees/${e.id}`} className="text-brand-600 hover:underline">
                        {t('employees.view', lang)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
