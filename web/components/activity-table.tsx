import Link from 'next/link'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import type { ActivityItem, ActivityType } from '@/lib/dashboard'

// Recent-activity table shared by the dashboard home and the full activity log.
// Each row is clickable (whole-row hit area via a stretched Link) and opens the
// underlying record where one is addressable.

export const ACTIVITY_TONE: Record<ActivityType, string> = {
  admission: 'bg-mint-soft text-mint-deep',
  notice: 'bg-sun-soft text-sun-deep',
  feedback: 'bg-alert-soft text-alert-deep',
}
export const ACTIVITY_LABEL: Record<ActivityType, MessageKey> = {
  admission: 'dash.raAdmission',
  notice: 'dash.raNotice',
  feedback: 'dash.raFeedback',
}

export function describeActivity(a: ActivityItem, lang: Lang): string {
  if (a.type === 'admission') return `${t('dash.raAdmissionDesc', lang)} — ${a.title}`
  if (a.type === 'feedback') return `${t('dash.raFeedbackDesc', lang)} — ${a.title}`
  return a.title
}

export function ActivityTable({ items, lang, emptyLabel }: { items: ActivityItem[]; lang: Lang; emptyLabel: string }) {
  const dateFmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  if (items.length === 0) return <p className="p-6 text-sm text-muted">{emptyLabel}</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse">
        <thead>
          <tr className="border-b border-line/70">
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('dash.raType', lang)}</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('dash.raDescription', lang)}</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t('dash.raWhen', lang)}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a, i) => (
            <tr
              key={a.id ?? i}
              className={`relative border-b border-line/40 last:border-0 ${a.href ? 'hover:bg-brand-50/40' : ''}`}
            >
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ACTIVITY_TONE[a.type]}`}>
                  {t(ACTIVITY_LABEL[a.type], lang)}
                </span>
              </td>
              <td className="px-4 py-2 text-sm text-ink">
                {a.href ? (
                  <Link
                    href={a.href}
                    className="font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300"
                  >
                    {describeActivity(a, lang)}
                  </Link>
                ) : (
                  describeActivity(a, lang)
                )}
              </td>
              <td className="px-4 py-2 text-sm text-muted tabular-nums">{dateFmt.format(new Date(a.at))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
