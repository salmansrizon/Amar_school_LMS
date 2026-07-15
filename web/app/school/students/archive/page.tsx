import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { matchesStudentQuery } from '@/lib/students'
import { RestoreButton } from './restore-button'

// Layout per ui/school-owner/students-archive.html: search + table Roll |
// Name | Last Class/Section | Guardian | Archived On | Status | actions
// (View, Restore). Soft-archive only — rows stay for history/reports.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export default async function StudentsArchivePage({
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

  const { data: students } = await supabase
    .from('students')
    .select('id, full_name, roll_number, class_name, section, guardian_name, archived_at')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })

  const visible = (students ?? []).filter((s) => matchesStudentQuery(s, q))
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const dash = <span className="text-muted">—</span>

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('students.archiveTitle', lang)}</h1>
        <Link href="/school/students" aria-label={t('students.activeList', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <form className="mb-4 flex items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder={t('students.archiveSearch', lang)}
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
          <p className="text-sm text-muted">{t('students.noArchived', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className={thClass}>{t('students.roll', lang)}</th>
                  <th className={thClass}>{t('students.name', lang)}</th>
                  <th className={thClass}>{t('students.lastClassSection', lang)}</th>
                  <th className={thClass}>{t('students.guardian', lang)}</th>
                  <th className={thClass}>{t('students.archivedOn', lang)}</th>
                  <th className={thClass}>{t('students.status', lang)}</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id} className="border-b border-line">
                    <td className={tdClass}>{s.roll_number ?? dash}</td>
                    <td className={`${tdClass} font-medium`}>{s.full_name}</td>
                    <td className={tdClass}>
                      {[s.class_name, s.section].filter(Boolean).join(' / ') || dash}
                    </td>
                    <td className={tdClass}>{s.guardian_name ?? dash}</td>
                    <td className={tdClass}>
                      {s.archived_at ? new Date(s.archived_at).toLocaleDateString(locale) : dash}
                    </td>
                    <td className={tdClass}>
                      <span className="rounded-full bg-paper-muted px-2 py-0.5 text-xs font-semibold text-muted">
                        {t('students.oldStudent', lang)}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/school/students/${s.id}`}
                          className="text-brand-600 hover:underline"
                        >
                          {t('students.view', lang)}
                        </Link>
                        <RestoreButton lang={lang} studentId={s.id} />
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
