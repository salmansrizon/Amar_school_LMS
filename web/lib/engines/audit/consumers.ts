// Event-driven auto-audit (map #258, #261). Subscribes the Audit engine to
// every domain event so significant business actions are recorded without each
// module remembering to log. Idempotent on event id (at-least-once safe).
import { cronClient, reconcileSecret } from '@/lib/cron/job'
import { DOMAIN_EVENT_TYPES } from '@/lib/engines/events'
import { subscribe } from '@/lib/engines/events/registry'
import { eventToAuditEntry, recordAudit } from './engine'

let registered = false

/** Register the audit consumer for all domain event types (once per process). */
export function registerAuditConsumers(): void {
  if (registered) return
  registered = true
  for (const type of DOMAIN_EVENT_TYPES) {
    subscribe(type, async (event) => {
      await recordAudit(cronClient(), eventToAuditEntry(event), {
        jobSecret: reconcileSecret(),
        dedupeKey: event.id,
      })
    })
  }
}
