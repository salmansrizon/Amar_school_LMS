import { NextResponse } from 'next/server'
import { cronClient, isCronAuthorized, reconcileSecret } from '@/lib/cron/job'

// Scheduled by Vercel cron (vercel.json). Reconciliation is a batch job, never
// synchronous with ingest (issue #10). What to reconcile comes from
// attendance_reconcile_dates — every ingest re-pends the (School, local day)
// pairs it touched — so this route drains that queue instead of reconciling one
// global date (Machine Attendance baseline §15.2.1, migration 0215).
//
//   GET                                   drain the queue
//   GET ?date=YYYY-MM-DD[&school=<uuid>]  manual backfill: only enqueue that day
//                                         (for every School with taps on it, or one School)

const PAIRS_PER_CALL = 200
// A drain call that claimed a full batch may have left more due pairs; keep
// going, but bounded so one cron invocation cannot run unbounded.
const MAX_CALLS = 10

const DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type DrainResult = {
  claimed: number
  done: number
  skipped: number
  repended: number
  failed: number
  upserted: number
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const date = url.searchParams.get('date')
  const school = url.searchParams.get('school')
  const supabase = cronClient()

  if (date !== null || school !== null) {
    if (date === null || !DATE.test(date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
    }
    if (school !== null && !UUID.test(school)) {
      return NextResponse.json({ error: 'school must be a UUID' }, { status: 400 })
    }
    const { data, error } = await supabase.rpc('enqueue_attendance_reconcile_dates', {
      job_secret: reconcileSecret(),
      target_date: date,
      target_school: school,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ date, school, enqueued: data })
  }

  const total: DrainResult = { claimed: 0, done: 0, skipped: 0, repended: 0, failed: 0, upserted: 0 }
  for (let call = 0; call < MAX_CALLS; call++) {
    const { data, error } = await supabase.rpc('drain_attendance_reconcile_queue', {
      job_secret: reconcileSecret(),
      max_pairs: PAIRS_PER_CALL,
    })
    if (error) return NextResponse.json({ error: error.message, drained: total }, { status: 500 })
    const result = data as DrainResult
    for (const key of Object.keys(total) as (keyof DrainResult)[]) total[key] += result[key]
    if (result.claimed < PAIRS_PER_CALL) break
  }
  return NextResponse.json({ drained: total })
}
