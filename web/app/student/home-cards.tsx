import Link from 'next/link'
import { t, type Lang } from '@/lib/i18n'
import type { StudentNotice } from '@/lib/student/notices'

// The two things the home screen knew but never said: what the newest notices
// actually are, and whether money is owed. The screen carried a count badge for
// notices ("2 new") and nothing at all for fees, so a student had to open two
// more pages to learn anything, and half the viewport sat empty below the fold.

export function LatestNotices({
  notices,
  unread,
  lang,
  locale,
}: {
  notices: StudentNotice[]
  unread: Set<string>
  lang: Lang
  locale: string
}) {
  if (!notices.length) return null
  return (
    <section className="rounded-lg border border-line bg-paper p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-bold">{t('student.noticesTitle', lang)}</h2>
        <Link href="/student/notices" className="text-xs font-semibold text-brand-600 hover:underline">
          {t('dash.viewAll', lang)}
        </Link>
      </div>
      <ul className="divide-y divide-line">
        {notices.slice(0, 3).map((n) => (
          <li key={n.id}>
            <Link href={`/student/notices/${n.id}`} className="block py-2 hover:opacity-80">
              <span className="flex items-center gap-2">
                {unread.has(n.id) && <span className="size-1.5 shrink-0 rounded-full bg-brand-500" />}
                <span className="truncate text-sm font-medium">{n.title}</span>
              </span>
              <span className="block text-xs text-muted">
                {new Date(n.created_at).toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Shown only when something is owed: a zero balance is not news, and a fee
 *  card that is always there is a card nobody reads. */
export function FeesDue({ due, lang, money }: { due: number; lang: Lang; money: (n: number) => string }) {
  if (due <= 0) return null
  return (
    <Link
      href="/student/fees"
      className="block rounded-lg border border-alert bg-alert-soft p-4 hover:brightness-95"
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-alert-deep">
        {t('student.totalDue', lang)}
      </span>
      <span className="block text-2xl font-extrabold text-alert-deep">৳{money(due)}</span>
    </Link>
  )
}
