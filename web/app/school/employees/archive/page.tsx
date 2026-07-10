import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { matchesEmployeeQuery } from '@/lib/employees'
import { RestoreButton } from './restore-button'

// Layout per ui/school-owner/employees-archive.html: search + table Name |
// Category | Department | Archived On | Status | actions (View, Restore).
// Soft-archive only — rows stay for history/reports.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export default async function EmployeesArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: employees } = await supabase
    .from('employees')
    .select('id, full_name, category, department, archived_at')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })

  const visible = (employees ?? []).filter((e) => matchesEmployeeQuery(e, q))
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const dash = <span className="text-muted">—</span>

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('employees.archiveTitle', lang)}</h1>
        <Link href="/school/employees" className="text-sm text-brand-600 hover:underline">
          ← {t('employees.activeList', lang)}
        </Link>
      </div>

      <form className="mb-4 flex items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder={t('employees.archiveSearch', lang)}
          className="w-64 rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('classes.filter', lang)}
        </button>
      </form>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
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
                {visible.map((e) => (
                  <tr key={e.id} className="border-b border-line">
                    <td className={`${tdClass} font-medium`}>{e.full_name}</td>
                    <td className={tdClass}>{e.category ?? dash}</td>
                    <td className={tdClass}>{e.department ?? dash}</td>
                    <td className={tdClass}>
                      {e.archived_at ? new Date(e.archived_at).toLocaleDateString(locale) : dash}
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
      </section>
    </main>
  )
}
