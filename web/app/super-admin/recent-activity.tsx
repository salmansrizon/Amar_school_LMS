import Link from 'next/link'
import { t, type Lang } from '@/lib/i18n'
import { formatTaka } from '@/components/super-admin/dashboard-ui'
import type { ActivityEvent } from '@/lib/super-admin/dashboard-read-model'

// Recent-activity feed (map #171 T5): derive-only events (code redemptions + new
// schools) newest-first. Presentational — the read model already sorted/capped.
// SMS top-ups join the feed once T6 lands sms_credit_ledger.

const DOT = {
  redemption: 'bg-mint-deep',
  new_school: 'bg-brand-600',
} as const

export function RecentActivity({ events, lang }: { events: ActivityEvent[]; lang: Lang }) {
  if (events.length === 0) {
    return <p className="p-4 text-sm text-muted sm:p-5">{t('sa.dash.noActivity', lang)}</p>
  }
  return (
    <ul className="divide-y divide-line/70 text-sm">
      {events.map((e, i) => (
        <li key={`${e.kind}-${e.schoolId}-${e.at}-${i}`} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
          <span className={`size-2 shrink-0 rounded-full ${DOT[e.kind]}`} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {e.schoolId ? (
              <Link href={`/super-admin/schools/${e.schoolId}`} className="font-semibold text-brand-700 hover:underline">
                {e.schoolName}
              </Link>
            ) : (
              <span className="font-semibold text-ink">{e.schoolName}</span>
            )}{' '}
            <span className="text-muted">
              {e.kind === 'redemption' ? t('sa.activity.redeemed', lang) : t('sa.activity.newSchool', lang)}
              {e.kind === 'redemption' && e.amount !== undefined ? ` · ${formatTaka(e.amount)}` : ''}
            </span>
          </span>
          <span className="shrink-0 text-xs text-muted">{e.at.slice(0, 10)}</span>
        </li>
      ))}
    </ul>
  )
}
