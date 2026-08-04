// Event-driven notifications (map #258, #267 wiring, #271). Subscribes the
// Notification engine to domain events so significant activity notifies the right
// user without the originating module knowing about channels. Runs system-side
// (reconcile secret) from the outbox drain. Idempotent enough: the publish path
// marks events dispatched on success, so redelivery is rare.
import { cronClient, reconcileSecret } from '@/lib/cron/job'
import { subscribe } from '@/lib/engines/events/registry'
import { createNotificationEngine } from './engine'
import { expiringSoonNotification, type SubscriptionExpiringSoonPayload } from './events'

let registered = false

/** Register domain-event → notification consumers (once per process). */
export function registerNotificationConsumers(): void {
  if (registered) return
  registered = true

  // A confirmed subscription/SMS/etc. payment notifies the school owner.
  subscribe('InvoicePaid', async (event) => {
    if (!event.schoolId) return
    const client = cronClient()
    const secret = reconcileSecret()
    const { data: ownerId } = await client.rpc('school_owner_id', {
      p_school: event.schoolId,
      job_secret: secret,
    })
    if (!ownerId) return
    const payload = event.payload as { number?: string }
    await createNotificationEngine(client, secret).send({
      schoolId: event.schoolId,
      recipientId: ownerId as string,
      templateKey: 'invoice_paid',
      data: { number: payload.number ?? '' },
      channels: ['in_app'],
    })
  })

  // Expiry sweep publishes SubscriptionExpiringSoon; the engine delivers the
  // owner an in-app notice. The SMS + activity-feed reminder still ship from the
  // sweep (durable channel); this adds the inbox notice via the engine, with the
  // recipient resolved from the event payload (#267 per-event resolution).
  subscribe('SubscriptionExpiringSoon', async (event) => {
    const payload = event.payload as SubscriptionExpiringSoonPayload
    if (!payload.ownerId || !payload.schoolId) return
    const client = cronClient()
    const secret = reconcileSecret()
    await createNotificationEngine(client, secret).send(expiringSoonNotification(payload))
  })
}
