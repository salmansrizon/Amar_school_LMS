import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron/job'
import { systemEventEngine } from '@/lib/engines/events/engine'
// Side-effect import: register all in-process consumers before draining.
import '@/lib/engines/events/consumers'

// Async safety net for the Event outbox (map #258, #260). The publish path
// dispatches consumers synchronously; this cron drains any rows whose sync
// consumers failed, or that were enqueued from SQL. Consumers are idempotent on
// event id, so re-running an already-sync-dispatched-but-unmarked row is safe.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { processed } = await systemEventEngine().drainOutbox()
  return NextResponse.json({ processed })
}
