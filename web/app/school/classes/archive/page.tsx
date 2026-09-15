import Form from 'next/form'
import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { RestoreButton } from './restore-button'

// Old Classes (ADR 0024) — mirrors Employees'/Students' own soft-archive
// list exactly: search + table, Restore only (no per-class detail page to
// View into). Every subject, fee structure, routine slot, exam, publication
// target and enrollment history under a listed row is untouched — archiving
// never removed any of it, only the row's own availability for new picks.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export default async function ClassesArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
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
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const dash = <span className="text-muted">—</span>

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('classes.oldClasses', lang)}</h1>
        <Link
          href="/school/classes"
          aria-label={t('classes.activeList', lang)}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
      </div>

      <Form className="mb-4 flex items-center gap-2" action="/school/classes/archive">
        <input
          name="q"
          defaultValue={q}
          placeholder={t('classes.archiveSearch', lang)}
          className="w-64 rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
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
                {visible.map((c) => (
                  <tr key={c.id} className="border-b border-line">
                    <td className={`${tdClass} font-medium`}>{c.name}</td>
                    <td className={tdClass}>{c.section ?? dash}</td>
                    <td className={tdClass}>{c.education_level ?? dash}</td>
                    <td className={tdClass}>{c.group_department ?? dash}</td>
                    <td className={tdClass}>
                      {c.archived_at ? new Date(c.archived_at).toLocaleDateString(locale) : dash}
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
      </section>
    </div>
  )
}
