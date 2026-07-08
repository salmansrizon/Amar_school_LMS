import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Scheduled daily by Vercel cron (vercel.json) after the school day ends —
// reconciliation is a batch job, never synchronous with ingest (issue #10).
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  // Default to today (UTC); ?date=YYYY-MM-DD allows manual backfill.
  const target = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )
  const { data, error } = await supabase.rpc('reconcile_attendance', {
    job_secret: process.env.RECONCILE_SECRET!,
    target_date: target,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ date: target, reconciled: data })
}
