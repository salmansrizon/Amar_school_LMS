import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, formatDate, formatNumber } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { loadNoticeFeed } from '@/lib/student/notices-source'
import { isForMyClass, type StudentNotice } from '@/lib/student/notices'
import { IMPORTANCE_LEVELS, importanceLabel } from '@/lib/publishing'
import { matchesQ, pageOf } from '@/lib/student/table'
import { studentGroupTabs } from '@/lib/student-nav'
import { pageTitle } from '@/lib/page-title'
import { PageHeader, railClass } from '@/components/ui/page'
import { SectionTabs } from '@/components/ui/section-tabs'
import { EmptyState } from '@/components/ui/states'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { NoMatch } from '@/components/student/no-match'
import { PhoneRows, PhoneRowsShell } from '@/components/student/phone-rows'

// The Student's notice feed (#445) as a table. Urgent first, then newest — an
// urgent notice from Monday still outranks a normal one from Friday, which is
// the whole point of marking it urgent.
export const generateMetadata = pageTitle('student.noticesTitle')

const IMPORTANCE_TONE = { urgent: 'alert', important: 'sun', normal: 'muted' } as const

export default async function StudentNoticesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const lang = await currentLang()
  const { supabase } = await getStudentContext()
  const { notices, unread } = await loadNoticeFeed(supabase)

  const shown = notices.filter(
    (n) =>
      matchesQ(params.q, n.title) &&
      (!params.read || (params.read === 'unread') === unread.has(n.id)) &&
      (!params.importance || n.importance === params.importance),
  )
  const paged = pageOf(shown, params)

  const columns: Column<StudentNotice>[] = [
    {
      key: 'title',
      header: t('student.col.title', lang),
      card: 'title',
      cell: (n) => (
        <>
          <Link
            href={`/student/notices/${n.id}`}
            className="inline-flex min-h-11 items-center font-semibold hover:text-brand-600 hover:underline md:min-h-0"
          >
            {n.title}
          </Link>
          <div className="text-xs text-muted">
            {isForMyClass(n) ? t('student.forMyClass', lang) : t('student.forEveryone', lang)}
          </div>
        </>
      ),
    },
    {
      key: 'importance',
      header: t('student.col.type', lang),
      card: 'badge',
      cell: (n) => <Pill tone={IMPORTANCE_TONE[n.importance]}>{importanceLabel(n.importance, lang)}</Pill>,
    },
    { key: 'date', header: t('student.col.date', lang), cell: (n) => formatDate(n.created_at, lang) },
    {
      key: 'read',
      header: t('student.col.read', lang),
      card: 'badge',
      cell: (n) =>
        unread.has(n.id) ? (
          <Pill tone="brand">{t('student.newBadge', lang)}</Pill>
        ) : (
          <span className="text-muted">{t('student.col.readDone', lang)}</span>
        ),
    },
  ]

  return (
    <main className="w-full px-gutter pt-section pb-16">
      <PageHeader
        title={t('student.noticesTitle', lang)}
        crumbs={{ lang, items: [{ label: t('student.nav.home', lang), href: '/student' }, { label: t('student.noticesTitle', lang) }] }}
        badge={unread.size ? `${formatNumber(unread.size, lang)} ${t('student.dash.newNotices', lang)}` : undefined}
      />
      <SectionTabs
        tabs={studentGroupTabs('overview', { notices: unread.size })}
        active="/student/notices"
        lang={lang}
        label={t('student.navGroup.overview', lang)}
      />

      {!notices.length ? (
        <EmptyState
          lang={lang}
          title={t('student.noNotices', lang)}
          action={{ href: '/student', label: t('student.nav.home', lang) }}
        />
      ) : (
        <PhoneRowsShell
          rows={
            <PhoneRows label={t('student.noticesTitle', lang)}>
              {paged.items.map((n) => {
                const isNew = unread.has(n.id)
                return (
                  <li key={n.id}>
                    {/* Rail: alert when urgent, brand when unread; the words stay on line two. */}
                    <Link
                      href={`/student/notices/${n.id}`}
                      className={`flex min-h-14 flex-col justify-center py-1 pr-3 pl-3 hover:text-brand-600 ${railClass(n.importance === 'urgent' ? 'alert' : isNew ? 'brand' : 'muted')}`}
                    >
                      <span className="truncate text-sm font-medium">{n.title}</span>
                      <span className="truncate text-xs text-muted">
                        {formatDate(n.created_at, lang)}
                        {n.importance === 'urgent' && (
                          <span className="font-semibold text-alert-deep"> · {importanceLabel(n.importance, lang)}</span>
                        )}
                        {isNew && <span className="font-semibold text-brand-700"> · {t('student.newBadge', lang)}</span>}
                        {` · ${isForMyClass(n) ? t('student.forMyClass', lang) : t('student.forEveryone', lang)}`}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </PhoneRows>
          }
        >
        <DataTable
          rows={paged.items}
          rowId={(n) => n.id}
          rowLabel={(n) => n.title}
          columns={columns}
          lang={lang}
          params={params}
          caption={t('student.noticesTitle', lang)}
          search={{ placeholder: t('student.col.search', lang) }}
          filters={[
            {
              param: 'read',
              label: t('student.col.read', lang),
              options: [
                { value: 'unread', label: t('student.col.unread', lang) },
                { value: 'read', label: t('student.col.readDone', lang) },
              ],
            },
            {
              param: 'importance',
              label: t('student.col.importance', lang),
              options: IMPORTANCE_LEVELS.map((i) => ({ value: i.key, label: i.label[lang] })),
            },
          ]}
          pagination={{ page: paged.page, totalPages: paged.totalPages, total: paged.total, pageSize: paged.pageSize }}
          empty={<NoMatch lang={lang} />}
        />
        </PhoneRowsShell>
      )}
    </main>
  )
}
