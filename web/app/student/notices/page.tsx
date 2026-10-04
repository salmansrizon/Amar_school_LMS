import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, formatDate, formatNumber } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { loadNoticeFeed } from '@/lib/student/notices-source'
import { isForMyClass } from '@/lib/student/notices'
import { importanceBadgeClass, importanceLabel } from '@/lib/publishing'
import { studentGroupTabs } from '@/lib/student-nav'
import { pageTitle } from '@/lib/page-title'
import { PageHeader, railClass } from '@/components/ui/page'
import { SectionTabs } from '@/components/ui/section-tabs'
import { EmptyState } from '@/components/ui/states'

// The Student's notice feed (#445). Urgent first, then newest — an urgent
// notice from Monday still outranks a normal one from Friday, which is the
// whole point of marking it urgent.
export const generateMetadata = pageTitle('student.noticesTitle')

export default async function StudentNoticesPage() {
  const lang = await currentLang()
  const { supabase } = await getStudentContext()
  const { notices, unread } = await loadNoticeFeed(supabase)

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
        <ul className="grid gap-grid lg:grid-cols-2">
          {notices.map((notice) => {
            const isNew = unread.has(notice.id)
            return (
              <li key={notice.id}>
                {/* Rail: alert when urgent, brand when unread. The words stay. */}
                <Link
                  href={`/student/notices/${notice.id}`}
                  className={`block min-h-11 rounded-lg border border-line bg-paper p-card transition hover:border-brand-300 ${railClass(notice.importance === 'urgent' ? 'alert' : isNew ? 'brand' : 'muted')}`}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${importanceBadgeClass(notice.importance)}`}
                    >
                      {importanceLabel(notice.importance, lang)}
                    </span>
                    {isNew && (
                      <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-semibold text-white">
                        {t('student.newBadge', lang)}
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      {isForMyClass(notice) ? t('student.forMyClass', lang) : t('student.forEveryone', lang)}
                    </span>
                  </div>
                  <div className="font-semibold">{notice.title}</div>
                  <div className="text-xs text-muted">{formatDate(notice.created_at, lang)}</div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
