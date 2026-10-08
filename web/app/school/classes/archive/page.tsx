import Form from 'next/form'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang, formatDate } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { RestoreButton } from './restore-button'
import { filterButtonClass, inputClass } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { Pager, paginate, pageSizeFrom } from '@/components/pager'
import { pageTitle } from '@/lib/page-title'

// Old Classes (ADR 0024) — mirrors Employees'/Students' own soft-archive
// list exactly: search + table, Restore only (no per-class detail page to
// View into). Every subject, fee structure, routine slot, exam, publication
// target and enrollment history under a listed row is untouched — archiving
// never removed any of it, only the row's own availability for new picks.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export const generateMetadata = pageTitle('classes.oldClasses')

export default async function ClassesArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; size?: string }>
}) {
  const params = await searchParams
  const { q = '' } = params
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: classes } = await supabase
    .from('class_offerings')
    .select('id, name, section, education_level, group_department, archived_at')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })

  const query = q.trim().toLowerCase()
  const visible = (classes ?? []).filter(
    (c) => !query || c.name.toLowerCase().includes(query) || (c.section ?? '').toLowerCase().includes(query),
  )
  const pageSize = pageSizeFrom(params.size, 20)
  const pageData = paginate(visible, params.page, pageSize)
  const dash = <span className="text-muted">—</span>

  return (
    <div>
      <PageHeader
        title={t('classes.oldClasses', lang)}
        backHref="/school/classes"
        backLabel={t('classes.activeList', lang)}
        crumbs={schoolCrumbs('/school/classes', lang, { label: t('classes.title', lang), href: '/school/classes' }, { label: t('classes.oldClasses', lang) })}
      />

      <Form className="mb-4 flex items-center gap-2" action="/school/classes/archive">
        <input
          name="q"
          defaultValue={q}
          placeholder={t('classes.archiveSearch', lang)}
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
          <p className="text-sm text-muted">{t('classes.noArchived', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className={thClass}>{t('classes.class', lang)}</th>
                  <th className={thClass}>{t('classes.section', lang)}</th>
                  <th className={thClass}>{t('classes.educationLevel', lang)}</th>
                  <th className={thClass}>{t('classes.groupDept', lang)}</th>
                  <th className={thClass}>{t('classes.archivedOn', lang)}</th>
                  <th className={thClass}>{t('classes.status', lang)}</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {pageData.items.map((c) => (
                  <tr key={c.id} className="border-b border-line">
                    <td className={`${tdClass} font-medium`}>{c.name}</td>
                    <td className={tdClass}>{c.section ?? dash}</td>
                    <td className={tdClass}>{c.education_level ?? dash}</td>
                    <td className={tdClass}>{c.group_department ?? dash}</td>
                    <td className={tdClass}>
                      {c.archived_at ? formatDate(c.archived_at, lang) : dash}
                    </td>
                    <td className={tdClass}>
                      <span className="rounded-full bg-paper-muted px-2 py-0.5 text-xs font-semibold text-muted">
                        {t('classes.oldClass', lang)}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <RestoreButton lang={lang} classOfferingId={c.id} />
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
