// Notification engine implementation (map #258, #267). Renders bn/en templates
// and dispatches per channel. v1 fully implements the in-app channel (inbox rows
// via notification_push); sms/email reuse lib/sms + lib/email and are wired as
// their source features migrate onto events (deferred to avoid surprise sends).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NotificationEngine } from './index'

export interface Template {
  title: Record<string, string>
  body: Record<string, string>
}

/** Pure bn/en template render with {{placeholder}} interpolation. Bangla is the
 * default; falls back en -> bn when a language is missing. */
export function renderTemplate(
  tpl: Template,
  data: Record<string, unknown>,
  lang: 'bn' | 'en' = 'bn',
): { title: string; body: string } {
  const pick = (m: Record<string, string>) => m[lang] ?? m.en ?? m.bn ?? ''
  const interp = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(data[k] ?? ''))
  return { title: interp(pick(tpl.title)), body: interp(pick(tpl.body)) }
}

/** Push a rendered in-app notification (super/system). */
export async function pushInApp(
  client: SupabaseClient,
  input: { recipientId: string; schoolId: string | null; title: string; body: string },
  jobSecret?: string,
): Promise<string> {
  const { data, error } = await client.rpc('notification_push', {
    p_recipient: input.recipientId,
    p_school: input.schoolId,
    p_title: input.title,
    p_body: input.body,
    job_secret: jobSecret ?? null,
  })
  if (error) throw new Error(`notification_push failed: ${error.message}`)
  return data as string
}

/** Mark one of the caller's own notifications read. */
export async function markRead(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.rpc('notification_mark_read', { p_id: id })
  if (error) throw new Error(`notification_mark_read failed: ${error.message}`)
}

async function loadTemplate(client: SupabaseClient, key: string): Promise<Template> {
  const { data, error } = await client
    .from('notification_templates')
    .select('title, body')
    .eq('key', key)
    .single()
  if (error || !data) throw new Error(`unknown notification template: ${key}`)
  return data as Template
}

export function createNotificationEngine(client: SupabaseClient, jobSecret?: string): NotificationEngine {
  return {
    async send(request) {
      const channels = request.channels ?? ['in_app']
      if (!channels.includes('in_app')) return // v1: only the in-app channel dispatches here
      const tpl = await loadTemplate(client, request.templateKey)
      const { title, body } = renderTemplate(tpl, request.data)
      await pushInApp(client, { recipientId: request.recipientId, schoolId: request.schoolId, title, body }, jobSecret)
    },
  }
}
