// Audit engine implementation (map #258, #261) — SERVER ONLY.
// Writes go through the append-only record_audit RPC (no service-role key).
// Event-driven auto-audit is wired in ./consumers; recordAudit is also the
// explicit fallback for mutations that don't publish a domain event.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DomainEvent } from '@/lib/engines/events'
import type { AuditEngine, AuditEntry } from './index'

interface RecordOpts {
  /** Idempotency key — a repeat insert with the same key is a no-op. */
  dedupeKey?: string
  /** System authority (reconcile secret) for non-request contexts. */
  jobSecret?: string
}

/** Append one audit entry via the definer RPC. */
export async function recordAudit(
  client: SupabaseClient,
  entry: AuditEntry,
  opts: RecordOpts = {},
): Promise<void> {
  const { error } = await client.rpc('record_audit', {
    p_entity_type: entry.entityType,
    p_entity_id: entry.entityId,
    p_action: entry.action,
    p_school_id: entry.schoolId,
    p_actor_id: entry.actorId,
    p_before: entry.before ?? null,
    p_after: entry.after ?? null,
    p_ip: entry.ip,
    p_request_id: entry.requestId,
    p_dedupe_key: opts.dedupeKey ?? null,
    job_secret: opts.jobSecret ?? null,
  })
  if (error) throw new Error(`record_audit failed: ${error.message}`)
}

/** Map a domain event to the audit entry that records it. The event id is the
 * dedupe key (used by the consumer), so at-least-once redelivery is a no-op. */
export function eventToAuditEntry(event: DomainEvent): AuditEntry {
  return {
    actorId: event.actorId,
    schoolId: event.schoolId,
    entityType: 'domain_event',
    entityId: event.id,
    action: 'create',
    before: null,
    after: { type: event.type, payload: event.payload },
    ip: null,
    requestId: null,
  }
}

/** Bind an AuditEngine to a client for explicit `record()` calls. */
export function createAuditEngine(client: SupabaseClient, jobSecret?: string): AuditEngine {
  return {
    record: (entry) => recordAudit(client, entry, { jobSecret }),
  }
}
