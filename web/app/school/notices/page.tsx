import Form from 'next/form'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import {
  PUBLICATION_KINDS,
  filterPublications,
  importanceBadgeClass,
  importanceLabel,
  kindBadgeClass,
  kindLabel,
  targetAudienceLabel,
  type PublicationKind,
} from '@/lib/publishing'
import { NoticeTabs } from './notice-tabs'

// Layout per ui/school-owner/notices-list.html: one shared list for notices,
// homework, lesson plans, daily lessons and exam-prep (kind filter + search),
// each row linking to a shared detail page.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

export default async function NoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string }>
}) {
  const { q = '', kind = '' } = await searchParams
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: rows }] = await Promise.all([
    supabase
      .from('publications')
      .select(
        'id, kind, title, importance, target_type, target_class_name, target_section, created_at',
      )
      .order('created_at', { ascending: false }),
  ])
  const visible = filterPublications(rows ?? [], q, kind as PublicationKind | '')
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('notices.title', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>
      <NoticeTabs active="list" lang={lang} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Form className="flex flex-wrap items-center gap-2" action="/school/notices">
          <input
            name="q"
            defaultValue={q}
            placeholder={t('notices.search', lang)}
            className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
          />
          <select
            name="kind"
            defaultValue={kind}
            className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
          >
            <option value="">{t('notices.allTypes', lang)}</option>
            {PUBLICATION_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label[lang]}
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
        <Link
          href="/school/notices/new"
          className="cursor-pointer rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
        >
          + {t('notices.new', lang)}
        </Link>
      </div>

      {!visible.length ? (
        <p className="text-sm text-muted">{t('notices.none', lang)}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line-strong">
                <th className={thClass}>{t('notices.colTitle', lang)}</th>
                <th className={thClass}>{t('notices.colType', lang)}</th>
                <th className={thClass}>{t('notices.colImportance', lang)}</th>
                <th className={thClass}>{t('notices.colTarget', lang)}</th>
                <th className={thClass}>{t('notices.colDate', lang)}</th>
                <th className={thClass}>{t('classes.actions', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-b border-line">
                  <td className={`${tdClass} font-medium`}>{row.title}</td>
                  <td className={tdClass}>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${kindBadgeClass(row.kind)}`}
                    >
                      {kindLabel(row.kind, lang)}
                    </span>
                  </td>
                  <td className={tdClass}>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${importanceBadgeClass(row.importance)}`}
                    >
                      {importanceLabel(row.importance, lang)}
                    </span>
                  </td>
                  <td className={tdClass}>
                    {targetAudienceLabel(
                      {
                        target_type: row.target_type ?? 'all',
                        target_class_name: row.target_class_name ?? null,
                        target_section: row.target_section ?? null,
                      },
                      lang,
                    )}
                  </td>
                  <td className={tdClass}>{new Date(row.created_at).toLocaleDateString(locale)}</td>
                  <td className={tdClass}>
                    <Link
                      href={`/school/notices/${row.id}`}
                      className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
                    >
                      {t('notices.view', lang)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
