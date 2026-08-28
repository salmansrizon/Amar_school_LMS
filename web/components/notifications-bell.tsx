'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/school-icons'
import { createClient } from '@/lib/supabase/client'
import { t, type Lang } from '@/lib/i18n'

// Recipient-based notification bell (#287) — role-agnostic. Reads the caller's own
// `notifications` rows directly (RLS: "recipient reads/updates own"), shows an
// unread dot, and marks an item read on click. Every non-school role gets this
// via the AppShell default; school keeps its richer activity bell. "View all" →
// the shared /notifications inbox.

interface NotificationRow {
  id: string
  title: string
  body: string
  read_at: string | null
  created_at: string
}

export function NotificationsBell({
  lang,
  buttonClass,
  /** Where "view all" goes. The shared /notifications inbox has no role shell,
   *  so a group with its own inbox route (the Student portal) passes it here
   *  rather than dropping the user out of their portal mid-flow. */
  viewAllHref = '/notifications',
}: {
  lang: Lang
  buttonClass: string
  viewAllHref?: string
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationRow[] | null>(null)
  const [unread, setUnread] = useState(0)
  const [sheetTop, setSheetTop] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const dateFmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  // Unread badge on mount (count only).
  useEffect(() => {
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .then(({ count }) => setUnread(count ?? 0))
  }, [supabase])

  async function load() {
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(20)
    setItems((data as NotificationRow[]) ?? [])
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) {
      setSheetTop(ref.current ? Math.round(ref.current.getBoundingClientRect().bottom + 8) : null)
      if (items === null) load()
    }
  }

  async function markRead(id: string) {
    await supabase.rpc('notification_mark_read', { p_id: id })
    setItems((prev) => prev?.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)) ?? null)
    setUnread((u) => Math.max(0, u - 1))
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
        {unread > 0 && <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-alert ring-2 ring-paper" />}
      </button>

      {open && (
        <div
          style={sheetTop === null ? undefined : ({ '--sheet-top': `${sheetTop}px` } as React.CSSProperties)}
          className="fixed inset-x-3 top-[var(--sheet-top,4rem)] z-50 flex max-h-[calc(100dvh-var(--sheet-top,4rem)-0.75rem)] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:max-h-none sm:w-80 sm:max-w-[calc(100vw-1.5rem)]"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-bold uppercase tracking-wide text-muted">{t('shell.notifications', lang)}</span>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 sm:max-h-[60vh] sm:flex-none">
            {items === null && <li className="px-3 py-6 text-center text-sm text-muted">…</li>}
            {items?.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted">{t('notif.none', lang)}</li>
            )}
            {items?.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => n.read_at || markRead(n.id)}
                  className={`block w-full rounded-xl px-3 py-2 text-left transition hover:bg-brand-50/60 ${n.read_at ? '' : 'bg-brand-50/40'}`}
                >
                  <span className="flex items-center gap-2">
                    {!n.read_at && <span className="size-1.5 shrink-0 rounded-full bg-brand-500" />}
                    <span className="text-sm font-semibold text-ink">{n.title}</span>
                    <span className="ml-auto text-xs text-muted tabular-nums">{dateFmt.format(new Date(n.created_at))}</span>
                  </span>
                  <span className="mt-1 block text-sm text-muted">{n.body}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="shrink-0 border-t border-line p-2">
            <Link
              href={viewAllHref}
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
