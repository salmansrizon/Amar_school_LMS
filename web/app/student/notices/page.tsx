import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { loadNoticeFeed } from '@/lib/student/notices-source'
import { isForMyClass } from '@/lib/student/notices'
import { importanceBadgeClass, importanceLabel } from '@/lib/publishing'
import { pageTitle } from '@/lib/student/metadata'

// The Student's notice feed (#445). Urgent first, then newest — an urgent
// notice from Monday still outranks a normal one from Friday, which is the
// whole point of marking it urgent.
export const generateMetadata = pageTitle('student.noticesTitle')

export default async function StudentNoticesPage() {
  const lang = await currentLang()
  const { supabase } = await getStudentContext()
  const { notices, unread } = await loadNoticeFeed(supabase)

  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <main className="w-full p-6">
      <h1 className="mb-4 text-2xl font-extrabold">{t('student.noticesTitle', lang)}</h1>

      {!notices.length ? (
        <p className="rounded-lg border border-line bg-paper p-6 text-sm text-muted">
          {t('student.noNotices', lang)}
        </p>
      ) : (
        <ul className="max-w-3xl space-y-3">
          {notices.map((notice) => (
            <li key={notice.id}>
              <Link
                href={`/student/notices/${notice.id}`}
                className="block rounded-lg border border-line bg-paper p-4 transition hover:border-brand-300"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${importanceBadgeClass(notice.importance)}`}
                  >
                    {importanceLabel(notice.importance, lang)}
                  </span>
                  {unread.has(notice.id) && (
                    <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-semibold text-white">
                      {t('student.newBadge', lang)}
                    </span>
                  )}
                  <span className="text-xs text-muted">
                    {isForMyClass(notice)
                      ? t('student.forMyClass', lang)
                      : t('student.forEveryone', lang)}
                  </span>
                </div>
                <div className="font-semibold">{notice.title}</div>
                <div className="text-xs text-muted">
                  {new Date(notice.created_at).toLocaleDateString(locale, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
