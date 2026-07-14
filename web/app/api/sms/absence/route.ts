import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { smsGateway } from '@/lib/sms/gateway'
import { countSmsSegments } from '@/lib/sms/segments'

// Daily absence-SMS job (issue #12). Scheduled AFTER attendance reconciliation
// (see vercel.json order); rule evaluation lives in SQL, dispatch goes through
// the SmsGateway so providers are swappable without touching this code.
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const target = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )
  const secret = process.env.RECONCILE_SECRET!

  const { data, error } = await supabase.rpc('absence_sms_candidates', {
    job_secret: secret,
    target_date: target,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const gateway = smsGateway()
  let sent = 0
  let failed = 0
  // One batch id per rule per run: all of today's candidates for the same
  // rule group into a single sms_log "send" for the log screen (§5.7).
  const batchIdByRule = new Map<string, string>()
  for (const candidate of (data ?? []) as {
    school_id: string
    student_id: string
    student_name: string
    guardian_phone: string | null
    rule_id: string
    streak: number
  }[]) {
    const body = `${candidate.student_name} has been absent for ${candidate.streak} working day(s).`
    const segments = countSmsSegments(body).segments || 1
    let batchId = batchIdByRule.get(candidate.rule_id)
    if (!batchId) {
      batchId = crypto.randomUUID()
      batchIdByRule.set(candidate.rule_id, batchId)
    }

    // Record the send attempt first (deduped by the unique constraint),
    // optimistically as 'sent' — flipped to 'failed' below if the actual
    // gateway.send() doesn't succeed.
    const { data: logId, error: recordError } = await supabase.rpc('record_absence_sms', {
      job_secret: secret,
      p_school: candidate.school_id,
      p_student: candidate.student_id,
      p_rule: candidate.rule_id,
      p_sent_on: target,
      p_phone: candidate.guardian_phone,
      p_body: body,
      p_provider: gateway.name,
      p_batch: batchId,
      p_segments: segments,
    })
    if (recordError) {
      failed += 1
      continue
    }
    if (logId && candidate.guardian_phone) {
      try {
        const result = await gateway.send(candidate.guardian_phone, body)
        if (result.ok) {
          sent += 1
        } else {
          failed += 1
          await supabase.rpc('set_sms_log_status', { job_secret: secret, p_id: logId, p_status: 'failed' })
        }
      } catch {
        failed += 1
        await supabase.rpc('set_sms_log_status', { job_secret: secret, p_id: logId, p_status: 'failed' })
      }
    }
  }

  return NextResponse.json({ date: target, candidates: data?.length ?? 0, sent, failed })
}