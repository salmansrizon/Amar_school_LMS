'use server'

import { createClient } from '@/lib/supabase/server'

/** Mark one notification read.
 *
 *  A server action rather than an RPC from the browser (#527). The call itself was
 *  always trivial — `notification_mark_read` is RLS-scoped to the caller's own
 *  rows — but doing it from the browser required a Supabase client there, and one
 *  browser client anywhere means the session cookie has to stay readable by page
 *  JavaScript. Authorisation is unchanged; only the caller moved. */
export async function markNotificationRead(id: string): Promise<void> {
  const supabase = await createClient()
  await supabase.rpc('notification_mark_read', { p_id: id })
}

/** Mark several read in one round trip.
 *
 *  The inbox previously fired one request per unread row from the browser; a
 *  single action does the same work without N round trips. */
export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (!ids.length) return
  const supabase = await createClient()
  await Promise.all(ids.map((id) => supabase.rpc('notification_mark_read', { p_id: id })))
}

export interface BellNotification {
  id: string
  title: string
  body: string | null
  read_at: string | null
  created_at: string
}

/** Unread count for the bell badge. */
export async function unreadNotificationCount(): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
  return count ?? 0
}

/** The most recent notifications for the bell sheet.
 *
 *  Capped rather than unbounded — this is a dropdown, and an unbounded select is
 *  silently truncated at 1000 anyway (#530, #546). */
export async function recentNotifications(limit = 20): Promise<BellNotification[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('notifications')
    .select('id, title, body, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data as BellNotification[]) ?? []
}
