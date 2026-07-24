'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { t, type Lang } from '@/lib/i18n'
import { CHECKLIST_ITEMS, pendingChecklistItems, type ChecklistItemKey } from '@/lib/institute'
import { Icon } from '@/components/school-icons'
import { toggleDailyChecklist } from '@/app/school/dashboard-checklist-actions'

// Dashboard Activity Checklist (issue #117): a checkable card grid above the
// Upcoming feed. Reuses the daily_checklists model the Institute checklist
// (#39) already owns — an item is "due" while unchecked today, highlighted
// with a motion-safe pulse. Tapping a card optimistically toggles it and
// persists via the toggleDailyChecklist server action; a failure reverts.

type State = Record<ChecklistItemKey, boolean>

function toState(row: Record<ChecklistItemKey, boolean> | null): State {
  return Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i.key, row?.[i.key] ?? false])) as State
}

export function DashboardChecklist({
  lang,
  date,
  row,
}: {
  lang: Lang
  date: string
  row: Record<ChecklistItemKey, boolean> | null
}) {
  const [state, setState] = useState<State>(() => toState(row))
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // The still-due (unchecked) set drives both the count and each card's
  // highlight — one source of truth shared with the Institute checklist.
  const dueSet = useMemo(() => new Set(pendingChecklistItems(state)), [state])
  const total = CHECKLIST_ITEMS.length
  const done = total - dueSet.size
  const allDone = dueSet.size === 0

  const numLocale = lang === 'bn' ? 'bn-BD' : 'en-US'
  const fmt = (n: number) => n.toLocaleString(numLocale)

  function toggle(key: ChecklistItemKey) {
    const next = !state[key]
    setState((s) => ({ ...s, [key]: next }))
    setError(null)
    startTransition(async () => {
      const result = await toggleDailyChecklist(date, key, next)
      if (result.error) {
        setState((s) => ({ ...s, [key]: !next })) // revert
        setError(result.error)
      }
    })
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t('dash.checklist', lang)}</h2>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              allDone ? 'bg-mint-soft text-mint-deep' : 'bg-brand-50 text-brand-600'
            }`}
          >
            {allDone ? t('dash.checklistAllDone', lang) : `${fmt(done)} / ${fmt(total)}`}
          </span>
          {/* Source-module link (issue #117 Q5): the full checklist + date-range report. */}
          <Link
            href="/school/institute/checklist"
            className="inline-flex items-center gap-1 rounded-md px-1 text-xs font-semibold text-brand-600 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            {t('dash.viewAll', lang)}
            <Icon name="chevronRight" className="size-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {CHECKLIST_ITEMS.map((item) => {
          const checked = !dueSet.has(item.key)
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => toggle(item.key)}
              aria-pressed={checked}
              className={`group relative flex min-h-24 flex-col justify-between gap-3 rounded-2xl border p-4 text-left shadow-card backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 ${
                checked
                  ? 'border-mint-deep/30 bg-mint-soft/60'
                  : 'border-sun-deep/40 bg-sun-soft/50 motion-safe:animate-pulse'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-lg border-2 transition ${
                    checked ? 'border-mint-deep bg-mint-deep text-white' : 'border-line-strong bg-paper text-transparent'
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                {!checked && (
                  <span className="rounded-full bg-sun-deep/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sun-deep">
                    {t('dash.checklistDue', lang)}
                  </span>
                )}
              </div>
              <span className={`text-sm font-semibold ${checked ? 'text-mint-deep' : 'text-ink'}`}>{item.label[lang]}</span>
            </button>
          )
        })}
      </div>

      {error && <p className="mt-2 text-sm text-alert-deep">{error}</p>}
    </section>
  )
}
