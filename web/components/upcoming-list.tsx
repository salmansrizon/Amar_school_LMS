import Link from 'next/link'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { Icon } from '@/components/school-icons'
import type { UpcomingItem, UpcomingKind } from '@/lib/dashboard'

// Dashboard "Upcoming Activity" list — scheduled exams, holidays, and today's
// classes, soonest first. Replaces the Recent Activity table on the home page
// (recent activity now lives in the topbar bell + /school/activity).

const KIND_TONE: Record<UpcomingKind, string> = {
  exam: 'bg-sun-soft text-sun-deep',
  holiday: 'bg-alert-soft text-alert-deep',
  class: 'bg-sky-soft text-sky-deep',
}
const KIND_LABEL: Record<UpcomingKind, MessageKey> = {
  exam: 'upcoming.exam',
  holiday: 'upcoming.holiday',
  class: 'upcoming.class',
}
const KIND_ICON: Record<UpcomingKind, React.ComponentProps<typeof Icon>['name']> = {
  exam: 'exams',
  holiday: 'attendance',
  class: 'classes',
}

export function UpcomingList({ items, lang, today }: { items: UpcomingItem[]; lang: Lang; today: string }) {
  const dateFmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short' })

  if (items.length === 0) return <p className="p-6 text-sm text-muted">{t('upcoming.none', lang)}</p>

  return (
    <ul className="divide-y divide-line/50">
      {items.map((item, i) => {
        const when = item.date === today ? t('upcoming.today', lang) : dateFmt.format(new Date(item.date + 'T00:00:00Z'))
        const body = (
          <div className="flex items-center gap-3 px-4 py-3">
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${KIND_TONE[item.kind]}`}>
              <Icon name={KIND_ICON[item.kind]} className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_TONE[item.kind]}`}>
                  {t(KIND_LABEL[item.kind], lang)}
                </span>
                <span className="text-xs font-medium text-muted tabular-nums">{when}</span>
              </div>
              <div className="mt-0.5 truncate text-sm font-medium text-ink">{item.title}</div>
              {item.detail && <div className="truncate text-xs text-muted">{item.detail}</div>}
            </div>
          </div>
        )
        return (
          <li key={`${item.kind}-${i}`} className={item.href ? 'transition hover:bg-brand-50/40' : ''}>
            {item.href ? (
              <Link
                href={item.href}
                className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300"
              >
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        )
      })}
    </ul>
  )
}
