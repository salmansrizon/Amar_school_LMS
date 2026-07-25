'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { t, type Lang } from '@/lib/i18n'
import { formatTaka } from '@/components/super-admin/dashboard-ui'
import type { PayableRow } from '@/lib/super-admin/financials'
import { sendRenewalReminder } from './dashboard-actions'

// Renewals-due chase list (map #171 T5): the soon-expiring schools, each with
// its last-paid renewal forecast and two actions — SMS the owner a reminder, or
// jump to code generation. Replaces the read-only bridge list T3 left behind.

type RemindState = 'idle' | 'sent' | 'failed'

export function RenewalsChaseList({ rows, lang }: { rows: PayableRow[]; lang: Lang }) {
  const [state, setState] = useState<Record<string, RemindState>>({})
  const [pending, startTransition] = useTransition()

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-muted sm:p-5">{t('sa.dash.noRenewals', lang)}</p>
  }

  function remind(id: string) {
    startTransition(async () => {
      const result = await sendRenewalReminder(id)
      setState((s) => ({ ...s, [id]: result.sent ? 'sent' : 'failed' }))
    })
  }

  return (
    <ul className="divide-y divide-line/70 text-sm">
      {rows.map((r) => {
        const st = state[r.id] ?? 'idle'
        return (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
            <Link
              href={`/super-admin/schools/${r.id}`}
              className="min-w-0 flex-1 truncate font-semibold text-brand-700 hover:underline"
            >
              {r.name}
            </Link>

            <span className="text-muted">{r.expiry}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                r.daysLeft <= 2 ? 'bg-alert-soft text-alert-deep' : 'bg-sky-soft text-sky-deep'
              }`}
            >
              {r.daysLeft === 0
                ? t('sa.soonExpiring.today', lang)
                : `${r.daysLeft} ${t('sa.soonExpiring.days', lang)}`}
            </span>

            <span className="w-20 text-right font-bold text-ink">
              {r.lastPaid === null ? '—' : formatTaka(r.lastPaid)}
            </span>

            <span className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                disabled={pending || st === 'sent'}
                onClick={() => remind(r.id)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition disabled:opacity-60 ${
                  st === 'sent'
                    ? 'bg-mint-soft text-mint-deep'
                    : st === 'failed'
                      ? 'bg-alert-soft text-alert-deep'
                      : 'border border-line-strong text-muted hover:bg-brand-50 hover:text-brand-600'
                }`}
              >
                {st === 'sent' ? t('sa.dash.reminded', lang) : st === 'failed' ? t('sa.dash.remindFailed', lang) : t('sa.dash.remind', lang)}
              </button>
              <Link
                href="/super-admin/codes"
                className="rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white transition hover:bg-brand-700"
              >
                {t('sa.dash.createCode', lang)}
              </Link>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
