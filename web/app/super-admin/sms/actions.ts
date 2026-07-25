'use server'

import { requireSuperAdmin } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'
import { smsGateway } from '@/lib/sms/gateway'
import {
  schoolsUnderLocation,
  schoolSmsRecipients,
  SCHOOL_RECIPIENT_COLUMNS,
  type SchoolRecipientRow,
} from '@/lib/super-admin/school-recipients'

export interface SendResult {
  error?: string
  total?: number
  sent?: number
  failed?: number
}

// Super-admin broadcast SMS to schools (map #158, ticket #165). Recipients are
// resolved through the same pure helper the compose page previews with, so the
// count shown is the count sent. Each send is audited in super_admin_sms_log.
export async function sendSuperAdminSms(locationId: string | null, body: string): Promise<SendResult> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }

  const message = body.trim()
  if (!message) return { error: 'message required' }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: schools }, { data: locations }, { data: clusters }] = await Promise.all([
    supabase.from('schools').select(SCHOOL_RECIPIENT_COLUMNS),
    supabase.from('locations').select('id, parent_id'),
    supabase.from('clusters').select('id, location_id'),
  ])

  const inArea = schoolsUnderLocation(
    (schools ?? []) as SchoolRecipientRow[],
    locations ?? [],
    clusters ?? [],
    locationId,
  )
  const recipients = schoolSmsRecipients(inArea)
  if (recipients.length === 0) return { error: 'no recipients' }

  // Dispatch in parallel (matches the school-side sendCompose), tallying
  // per-recipient success/failure from the settled results.
  const gateway = smsGateway()
  const outcomes = await Promise.all(
    recipients.map(async (r) => {
      try {
        return (await gateway.send(r.phone, message)).ok
      } catch {
        return false
      }
    }),
  )
  const sent = outcomes.filter(Boolean).length
  const failed = outcomes.length - sent

  // Audit the broadcast. A failed audit write must not fail the already-sent
  // SMS, so it is intentionally not surfaced as an error.
  await supabase.from('super_admin_sms_log').insert({
    location_id: locationId,
    body: message,
    recipient_count: recipients.length,
    sent,
    failed,
    created_by: user?.id ?? null,
  })

  return { total: recipients.length, sent, failed }
}
