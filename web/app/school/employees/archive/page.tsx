import Form from 'next/form'
import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang, formatDate } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { employeeCategoryLabel, matchesEmployeeQuery } from '@/lib/employees'
import { RestoreButton } from './restore-button'
import { filterButtonClass, inputClass } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { Pager, paginate, pageSizeFrom } from '@/components/pager'
import { pageTitle } from '@/lib/page-title'

// Layout per ui/school-owner/employees-archive.html: search + table Name |
// Category | Department | Archived On | Status | actions (View, Restore).
// Soft-archive only — rows stay for history/reports.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export const generateMetadata = pageTitle('employees.archiveTitle')

export default async function EmployeesArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; size?: string }>
}) {
  const params = await searchParams
  const { q = '' } = params
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: employees } = await supabase
    .from('employees')
    .select('id, full_name, category, department, archived_at')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })

  const visible = (employees ?? []).filter((e) => matchesEmployeeQuery(e, q))
  const pageSize = pageSizeFrom(params.size, 20)
  const pageData = paginate(visible, params.page, pageSize)
  const dash = <span className="text-muted">—</span>

  return (
    <div>
      <PageHeader
        title={t('employees.archiveTitle', lang)}
        backHref="/school/employees"
        backLabel={t('employees.activeList', lang)}
        crumbs={schoolCrumbs('/school/employees', lang, { label: t('employees.title', lang), href: '/school/employees' }, { label: t('employees.archiveTitle', lang) })}
      />

      <Form className="mb-4 flex items-center gap-2" action="/school/employees/archive">
        <input
          name="q"
          defaultValue={q}
          placeholder={t('employees.archiveSearch', lang)}
          className={`${inputClass()} w-64`}
        />
        <button
          type="submit"
          className={filterButtonClass()}
        >
          {t('classes.filter', lang)}
        </button>
      </Form>

      <section className="rounded-lg border border-line bg-paper p-5">
        {!visible.length ? (
          <p className="text-sm text-muted">{t('employees.noArchived', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className={thClass}>{t('employees.name', lang)}</th>
                  <th className={thClass}>{t('employees.category', lang)}</th>
                  <th className={thClass}>{t('employees.department', lang)}</th>
                  <th className={thClass}>{t('employees.archivedOn', lang)}</th>
                  <th className={thClass}>{t('employees.status', lang)}</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {pageData.items.map((e) => (
                  <tr key={e.id} className="border-b border-line">
                    <td className={`${tdClass} font-medium`}>{e.full_name}</td>
                    <td className={tdClass}>{e.category ? employeeCategoryLabel(e.category, lang) : dash}</td>
                    <td className={tdClass}>{e.department ?? dash}</td>
                    <td className={tdClass}>
                      {e.archived_at ? formatDate(e.archived_at, lang) : dash}
                    </td>
                    <td className={tdClass}>
                      <span className="rounded-full bg-paper-muted px-2 py-0.5 text-xs font-semibold text-muted">
                        {t('employees.oldEmployee', lang)}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/school/employees/${e.id}`}
                          className="text-brand-600 hover:underline"
                        >
                          {t('employees.view', lang)}
                        </Link>
                        <RestoreButton lang={lang} employeeId={e.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {visible.length > 0 && (
          <Pager page={pageData.page} totalPages={pageData.totalPages} total={pageData.total} lang={lang} params={params} pageSize={pageSize} />
        )}
      </section>
    </div>
  )
}
