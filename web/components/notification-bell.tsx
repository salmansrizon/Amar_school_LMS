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
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-line bg-paper shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-bold uppercase tracking-wide text-muted">{t('dash.recentActivity', lang)}</span>
          </div>

          <ul className="max-h-[60vh] overflow-y-auto p-1">
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

          <div className="border-t border-line p-2">
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
