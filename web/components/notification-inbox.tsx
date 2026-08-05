'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { t, type Lang } from '@/lib/i18n'

export interface InboxRow {
  id: string
  title: string
  body: string
  read_at: string | null
  created_at: string
}

// Interactive list for the shared /notifications inbox (#287). Server-rendered
// rows are handed in; mark-read goes through the recipient-scoped RPC.
export function NotificationInbox({ initial, lang }: { initial: InboxRow[]; lang: Lang }) {
  const [rows, setRows] = useState(initial)
  const supabase = createClient()
  const dateFmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  async function markRead(id: string) {
    await supabase.rpc('notification_mark_read', { p_id: id })
    setRows((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)))
  }

  async function markAll() {
    const unread = rows.filter((n) => !n.read_at)
    await Promise.all(unread.map((n) => supabase.rpc('notification_mark_read', { p_id: n.id })))
    setRows((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
  }

  const anyUnread = rows.some((n) => !n.read_at)

  return (
    <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">{t('shell.notifications', lang)}</h2>
        {anyUnread && (
          <button
            type="button"
            onClick={markAll}
            className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('notif.markAll', lang)}
          </button>
        )}
      </div>
      <ul className="divide-y divide-line">
        {rows.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => n.read_at || markRead(n.id)}
              className={`block w-full py-3 text-left ${n.read_at ? '' : 'cursor-pointer'}`}
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
        {rows.length === 0 && <li className="py-8 text-center text-sm text-muted">{t('notif.none', lang)}</li>}
      </ul>
    </section>
  )
}
