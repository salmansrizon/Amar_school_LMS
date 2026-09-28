import Form from 'next/form'
import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { filterEmployees } from '@/lib/employees'
import { selectClass } from '@/components/ui/field'

// Layout per ui/school-owner/employees-list.html: search + category filter,
// table Name | Category | Qualification | Department | Status | View, with
// Old Employees + New Employee actions. Grace/Office-Time configuration
// moved to Attendance > Employees > Grace Time (issue #671) — this page no
// longer owns any grace UI, per-employee or otherwise.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'
export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>
}) {
  const { q = '', category = '' } = await searchParams
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: employees } = await supabase
    .from('employees')
    .select('id, full_name, category, qualification, department, archived_at')
    .is('archived_at', null)
    .order('full_name')

  const visible = filterEmployees(employees ?? [], q, category)
  const categories = [...new Set((employees ?? []).map((e) => e.category).filter(Boolean))] as string[]
  const dash = <span className="text-muted">—</span>

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('employees.title', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Form className="flex flex-wrap items-center gap-2" action="/school/employees">
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
        </Form>
        <div className="flex gap-2">
          <Link
            href="/school/employees/archive"
            className="rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('employees.oldEmployees', lang)}
          </Link>
          {/* One entry point (issue #566, reversing #533's deliberate split) —
              login and class assignment are now optional sections on this
              same form, not a second page. */}
          <Link
            href="/school/employees/new"
            className="rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
          >
            + {t('employees.add', lang)}
          </Link>
        </div>
      </div>

      <section className="rounded-lg border border-line bg-paper p-5">
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
    </div>
  )
}
