'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/school-icons'
import { ACTIVITY_TONE, ACTIVITY_LABEL, describeActivity } from '@/components/activity-table'
import { t, type Lang } from '@/lib/i18n'
import type { ActivityItem } from '@/lib/dashboard'

// Topbar notification bell → recent-activity popover. Fetches lazily on first
// open; clicking an item opens the underlying record. Matches the SearchPalette
// interaction model (outside-click / Esc to dismiss).
export function NotificationBell({ lang, buttonClass }: { lang: Lang; buttonClass: string }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ActivityItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  // Where the phone-width sheet starts: measured from the bell as it opens, so
  // it tracks the topbar's real height instead of hardcoding it (issue #118).
  const [sheetTop, setSheetTop] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const dateFmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) setSheetTop(ref.current ? Math.round(ref.current.getBoundingClientRect().bottom + 8) : null)
    if (next && items === null && !loading) {
      setLoading(true)
      fetch('/api/school/recent-activity')
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => setItems(d.items ?? []))
        .catch(() => setItems([]))
        .finally(() => setLoading(false))
    }
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const hasItems = (items?.length ?? 0) > 0

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={t('shell.notifications', lang)}
        aria-expanded={open}
        onClick={toggle}
        className={`${buttonClass} relative text-muted hover:bg-brand-50 hover:text-brand-600`}
      >
        <Icon name="bell" className="size-5" />
        {(items === null || hasItems) && (
          <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-alert ring-2 ring-paper" />
        )}
      </button>

      {open && (
        // The bell is not flush with the viewport edge (language pill, avatar and
        // logout sit to its right), so a popover anchored to it ran off the left
        // edge on narrow phones. Below `sm` it detaches to a viewport-inset sheet
        // that starts just under the bell; from `sm` up it anchors to the bell as
        // before, where there is room (#118). The measured offset rides on a
        // custom property so `sm:top-auto` can still drop it at wider widths.
        <div
          style={sheetTop === null ? undefined : ({ '--sheet-top': `${sheetTop}px` } as React.CSSProperties)}
          className="fixed inset-x-3 top-[var(--sheet-top,4rem)] z-50 flex max-h-[calc(100dvh-var(--sheet-top,4rem)-0.75rem)] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:max-h-none sm:w-80 sm:max-w-[calc(100vw-1.5rem)]"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-bold uppercase tracking-wide text-muted">{t('dash.recentActivity', lang)}</span>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 sm:max-h-[60vh] sm:flex-none">
            {loading && <li className="px-3 py-6 text-center text-sm text-muted">…</li>}
            {!loading && items?.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted">{t('dash.raNone', lang)}</li>
            )}
            {!loading &&
              items?.map((a, i) => {
                const inner = (
                  <>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ACTIVITY_TONE[a.type]}`}>
                        {t(ACTIVITY_LABEL[a.type], lang)}
                      </span>
                      <span className="text-xs text-muted tabular-nums">{dateFmt.format(new Date(a.at))}</span>
                    </span>
                    <span className="mt-1 block text-sm text-ink">{describeActivity(a, lang)}</span>
                  </>
                )
                return (
                  <li key={a.id ?? i}>
                    {a.href ? (
                      <Link
                        href={a.href}
                        onClick={() => setOpen(false)}
                        className="block rounded-xl px-3 py-2 transition hover:bg-brand-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="px-3 py-2">{inner}</div>
                    )}
                  </li>
                )
              })}
          </ul>

          <div className="shrink-0 border-t border-line p-2">
            <Link
              href="/school/activity"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-brand-600 hover:bg-brand-50/60"
            >
              {t('dash.viewAll', lang)}
              <Icon name="chevronRight" className="size-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
