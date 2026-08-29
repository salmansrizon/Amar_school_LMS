// Event engine implementation (map #258, #260) — SERVER ONLY.
//
// Publishing is a server concern: business events fire from server logic, and
// only the server holds the reconcile secret that authorizes writes to the
// append-only outbox (no service-role key in this environment). The engine
// enqueues via the publish_domain_event RPC, runs registered in-process
// consumers synchronously, then marks the row dispatched. A Vercel cron
// (drainOutbox) is the async safety net for rows whose sync consumers failed or
// that were enqueued from SQL.
import type { SupabaseClient } from '@supabase/supabase-js'
import { cronClient, reconcileSecret } from '@/lib/cron/job'
import type { DomainEvent, DomainEventType, EventEngine } from './index'
import { consumersFor, subscribe as registrySubscribe } from './registry'

/** Run every registered consumer for an event; resolves true iff all succeed.
 * Failures are swallowed per-consumer so one bad consumer can't block the rest;
 * the row stays undispatched and the cron drain retries it. */
async function dispatch(event: DomainEvent): Promise<boolean> {
  let allOk = true
  for (const consumer of consumersFor(event.type)) {
    try {
      await consumer(event)
    } catch {
      allOk = false
    }
  }
  return allOk
}

function toDomainEvent(row: {
  id: string
  type: string
  school_id: string | null
  payload: unknown
  actor_id: string | null
  occurred_at: string
}): DomainEvent {
  return {
    id: row.id,
    type: row.type as DomainEventType,
    schoolId: row.school_id,
    payload: row.payload,
    occurredAt: row.occurred_at,
    actorId: row.actor_id,
  }
}

/** Build a server-side event engine bound to a Supabase client + reconcile
 * secret. The secret authorizes outbox writes and dispatch marking. */
export function createEventEngine(client: SupabaseClient, jobSecret: string): EventEngine {
  return {
    async publish(event) {
      const { data: id, error } = await client.rpc('publish_domain_event', {
        p_type: event.type,
        p_school_id: event.schoolId,
        p_payload: event.payload ?? {},
        p_actor_id: event.actorId,
        job_secret: jobSecret,
      })
      if (error) throw new Error(`publish_domain_event failed: ${error.message}`)

      const full: DomainEvent = { ...event, id: id as string, occurredAt: new Date().toISOString() }
      if (await dispatch(full)) {
        await client.rpc('mark_domain_event_dispatched', { job_secret: jobSecret, p_id: full.id })
      }
    },

    subscribe(type, consumer) {
      // Registration is process-global (see ./registry) — the client binding is
      // irrelevant to it, so this just delegates.
      registrySubscribe(type, consumer)
    },

    async drainOutbox(batch = 50) {
      const { data, error } = await client.rpc('claim_domain_events', {
        job_secret: jobSecret,
        batch,
      })
      if (error) throw new Error(`claim_domain_events failed: ${error.message}`)

      let processed = 0
      for (const row of (data ?? []) as Parameters<typeof toDomainEvent>[0][]) {
        const event = toDomainEvent(row)
        if (await dispatch(event)) {
          await client.rpc('mark_domain_event_dispatched', { job_secret: jobSecret, p_id: event.id })
          processed += 1
        }
      }
      return { processed }
    },
  }
}

/** System event engine for platform-level publishing and the cron drain: an
 * anon, session-less client authorized by the reconcile secret. Use this to
 * publish events not tied to a user request (e.g. from cron jobs). */
export function systemEventEngine(): EventEngine {
  return createEventEngine(cronClient(), reconcileSecret())
}
