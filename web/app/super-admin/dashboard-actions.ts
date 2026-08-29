'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'
import { smsGateway } from '@/lib/sms/gateway'

// Super-admin business-dashboard actions (map #171 T5). The renewals chase list
// nudges an owner whose subscription is lapsing; the send reuses the same
// provider-agnostic SmsGateway and super_admin_sms_log audit trail as the
// broadcast (#165), just scoped to one school's owner mobile.

export interface RenewalReminderResult {
  error?: string
  sent?: boolean
}

/** Record a master-pool SMS purchase from the gateway (#188): buy `qty` SMS for
 *  `amount` ৳. Grows the pool the admin allocates from. Super-admin only. */
export async function recordSmsPurchase(
  qty: number,
  amount: number,
  note: string | null,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }
  if (!Number.isInteger(qty) || qty <= 0) return { error: 'quantity must be a positive whole number' }
  if (!Number.isFinite(amount) || amount < 0) return { error: 'invalid amount' }

  // The master SMS pool now lives on the company_sms wallet (#268).
  const { error } = await supabase.rpc('sms_pool_purchase', {
    segs: qty,
    amount_taka: amount,
    note,
  })
  if (error) return { error: 'purchase failed' }
  revalidatePath('/super-admin')
  return {}
}

/** Bilingual (bn-primary) renewal nudge to one owner. */
function renewalReminderText(name: string, expiry: string | null): string {
  const when = expiry ?? ''
  return `${name}: আপনার সাবস্ক্রিপশনের মেয়াদ ${when} তারিখে শেষ হচ্ছে। চালু রাখতে নবায়ন করুন। (Your subscription expires ${when}. Please renew.)`
}

/** SMS a renewal reminder to a single school's owner mobile. Audited; a failed
 *  audit write never fails the already-sent SMS. */
export async function sendRenewalReminder(schoolId: string): Promise<RenewalReminderResult> {
  const supabase = await createClient()
  if (!(await requireSuperAdmin(supabase))) return { error: 'Unauthorized' }

  const { data: school, error } = await supabase
    .from('schools')
    .select('name, mobile, subscription_expires_at')
    .eq('id', schoolId)
    .single()
  if (error) return { error: 'school lookup failed' }
  if (!school?.mobile) return { error: 'no mobile on file' }

  const body = renewalReminderText(school.name, school.subscription_expires_at)
  let ok = false
  try {
    ok = (await smsGateway().send(school.mobile, body)).ok
  } catch {
    ok = false
  }

  // Audit the send. A failed audit write must not fail the already-sent SMS.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    await supabase.from('super_admin_sms_log').insert({
      location_id: null,
      body,
      recipient_count: 1,
      sent: ok ? 1 : 0,
      failed: ok ? 0 : 1,
      created_by: user?.id ?? null,
    })
  } catch {
    // swallow — the SMS already went out
  }

  if (!ok) return { error: 'send failed' }
  return { sent: true }
}
