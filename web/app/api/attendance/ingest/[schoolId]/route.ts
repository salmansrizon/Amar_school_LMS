import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Dual-path ingest endpoint (ADR 0001): accepts a single device push
// ({card_number, tapped_at}) or a bridge-agent batch ({events: [...]}).
// Auth is the per-School ingest token — no user session (hardware caller).
export async function POST(request: Request, ctx: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = await ctx.params
  const token = request.headers.get('x-ingest-token')
  if (!token) {
    return NextResponse.json({ error: 'missing x-ingest-token header' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const events = Array.isArray((body as { events?: unknown[] })?.events)
    ? (body as { events: unknown[] }).events
    : [body] // single device push

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )
  const { data, error } = await supabase.rpc('ingest_attendance_events', {
    school: schoolId,
    token,
    events,
  })
  if (error) {
    const status = /invalid ingest token/.test(error.message) ? 401 : 400
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json({ ingested: data })
}
