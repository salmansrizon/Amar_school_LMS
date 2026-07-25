import { NextResponse } from 'next/server'
import { smsGateway } from '@/lib/sms/gateway'
import { cronClient, cronTargetDate, isCronAuthorized, reconcileSecret } from '@/lib/cron/job'
import { buildReminderMessage, REMINDER_TITLE } from '@/lib/super-admin/expiry-reminder'

// Daily subscription-expiry reminder sweep (map #158, ticket #163). The push
// side of expiry: nobody may log in to trigger it lazily, so a Vercel cron hits
// this route (see vercel.json). For every school lapsing in exactly 7 days it
// records a per-day-idempotent reminder (dedupe ledger + owner activity-feed
// notice, via the security-definer RPC) and, when newly recorded, sends the
// owner SMS. It does NOT set deactivated_at — read-time gating is #169.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const target = cronTargetDate(request)
  const supabase = cronClient()
  const secret = reconcileSecret()

  const { data, error } = await supabase.rpc('subscription_reminder_candidates', {
    job_secret: secret,
    target_date: target,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const gateway = smsGateway()
  let sent = 0
  let failed = 0
  for (const c of (data ?? []) as {
    school_id: string
    school_name: string
    owner_id: string | null
    phone: string | null
    expires_on: string
  }[]) {
    const body = buildReminderMessage(c.school_name, c.expires_on)

    // Claim the reminder first (dedupe + owner activity row). A false return
    // means another run already handled this expiry window — skip the SMS.
    const { data: recorded, error: recordError } = await supabase.rpc('record_subscription_reminder', {
      job_secret: secret,
      p_school: c.school_id,
      p_expires_on: c.expires_on,
      p_owner: c.owner_id,
      p_title: REMINDER_TITLE,
      p_body: body,
    })
    if (recordError) {
      failed += 1
      continue
    }
    if (!recorded) continue

    // SMS is best-effort: the durable reminder channel is the owner activity-feed
    // notice (committed above), so a transient gateway failure is only counted,
    // not retried — the dedupe row already marks this window handled.
    if (c.phone) {
      try {
        const result = await gateway.send(c.phone, body)
        if (result.ok) sent += 1
        else failed += 1
      } catch {
        failed += 1
      }
    }
  }

  return NextResponse.json({ date: target, candidates: data?.length ?? 0, sent, failed })
}
