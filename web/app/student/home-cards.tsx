import Link from 'next/link'
import { t, formatDate, type Lang } from '@/lib/i18n'
import { importanceLabel } from '@/lib/publishing'
import { railClass } from '@/components/ui/page'
import type { StudentNotice } from '@/lib/student/notices'

// The body of the home's "latest notices" card: the three notices the feed
// puts first (urgent, then newest). An urgent one carries the alert rail and
// the word for it; an unread one carries a dot and "new". Colour is never the
// only signal. With no notices the card says so rather than disappearing.
export function NoticeRows({
  notices,
  unread,
  lang,
}: {
  notices: StudentNotice[]
  unread: ReadonlySet<string>
  lang: Lang
}) {
  if (!notices.length) return <p className="py-6 text-center text-sm text-muted">{t('student.noNotices', lang)}</p>
  return (
    <ul className="divide-y divide-line">
      {notices.slice(0, 3).map((n) => {
        const urgent = n.importance === 'urgent'
        const isNew = unread.has(n.id)
        return (
          <li key={n.id}>
            <Link
              href={`/student/notices/${n.id}`}
              className={`flex min-h-11 flex-col justify-center px-3 py-2 transition hover:bg-paper-muted ${railClass(urgent ? 'alert' : undefined)}`}
            >
              <span className="flex items-center gap-2">
                {isNew && <span className="size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />}
                <span className="truncate text-sm font-medium">{n.title}</span>
              </span>
              <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                {urgent && <span className="font-semibold text-alert-deep">{importanceLabel(n.importance, lang)}</span>}
                {isNew && <span className="font-semibold text-brand-700">{t('student.newBadge', lang)}</span>}
                <span>{formatDate(n.created_at, lang)}</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
