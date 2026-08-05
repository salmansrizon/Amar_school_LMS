'use server'

import { revalidatePath } from 'next/cache'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { pgErrorMessage } from '@/lib/crud/pg-error'

// Notification template + channel-map CRUD (#292). Replicates the #288 pattern;
// RLS ("super admin manages notification_templates / _channel_map") is authority.
export async function upsertTemplate(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const key = String(formData.get('key') ?? '').trim()
  if (!key) return { error: 'Template key is required.' }
  const title = { bn: String(formData.get('title_bn') ?? ''), en: String(formData.get('title_en') ?? '') }
  const body = { bn: String(formData.get('body_bn') ?? ''), en: String(formData.get('body_en') ?? '') }

  const { error } = await supabase.from('notification_templates').upsert({ key, title, body })
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/super-admin/notifications')
  return {}
}

export async function deleteTemplate(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const key = String(formData.get('key') ?? '')
  const { error } = await supabase.from('notification_templates').delete().eq('key', key)
  if (error) {
    return { error: pgErrorMessage(error, { '23503': 'In use by a channel route — remove that first.' }) }
  }
  revalidatePath('/super-admin/notifications')
  return {}
}

export async function addChannelRoute(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const event_type = String(formData.get('event_type') ?? '').trim()
  const channel = String(formData.get('channel') ?? '')
  const template_key = String(formData.get('template_key') ?? '')
  if (!event_type || !template_key) return { error: 'Event and template are required.' }
  if (!['in_app', 'sms', 'email'].includes(channel)) return { error: 'Invalid channel.' }

  const { error } = await supabase.from('notification_channel_map').insert({ event_type, channel, template_key })
  if (error) return { error: pgErrorMessage(error, { '23505': 'That event+channel is already routed.' }) }
  revalidatePath('/super-admin/notifications')
  return {}
}

export async function removeChannelRoute(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getSuperAdminContext()
  const event_type = String(formData.get('event_type') ?? '')
  const channel = String(formData.get('channel') ?? '')
  const { error } = await supabase
    .from('notification_channel_map')
    .delete()
    .eq('event_type', event_type)
    .eq('channel', channel)
  if (error) return { error: pgErrorMessage(error) }
  revalidatePath('/super-admin/notifications')
  return {}
}
