// Event Architecture engine — SEAM ONLY (map #258, implemented in #260).
// Postgres outbox + in-process synchronous dispatch v1; slow consumers drained
// async via Vercel cron. At-least-once + idempotent consumers (event-id dedupe).
// Modules publish domain events instead of calling each other directly.

/** Catalog of platform domain events. Extended as phases land. The runtime
 * array is the single source of truth; the type is derived from it so the
 * #260 outbox impl and consumers share one registry. */
export const DOMAIN_EVENT_TYPES = [
  'SchoolCreated',
  'SubscriptionActivated',
  'SubscriptionRenewed',
  'InvoiceGenerated',
  'InvoicePaid',
  'SmsPurchased',
  'SmsDelivered',
  'FeatureEnabled',
  'FeatureDisabled',
  'AgreementAccepted',
  'DistributorApproved',
  'CommissionCalculated',
  'SettlementCompleted',
  'WorkflowStarted',
  'WorkflowCompleted',
  'ApprovalRequested',
  'ApprovalGranted',
  'ApprovalRejected',
  'SubscriptionExpiringSoon',
  'StudentAbsenceStreak',
] as const

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number]

/** Payload shape per event type — the binding that makes publish/subscribe
 * type-safe. Payloads are `unknown` at the seam stage and refined to concrete
 * shapes by the phase that first publishes each event (#260 onward). */
export type DomainEventPayloads = {
  [K in DomainEventType]: unknown
}

export interface DomainEvent<T extends DomainEventType = DomainEventType> {
  /** Stable unique id — consumers dedupe on this (at-least-once delivery). */
  id: string
  type: T
  /** Tenant scope; null for platform-level events. */
  schoolId: string | null
  payload: DomainEventPayloads[T]
  occurredAt: string
  /** Actor that caused the event, for downstream audit. */
  actorId: string | null
}

/** A consumer reacts to an event. Must be idempotent w.r.t. `event.id`. */
export type EventConsumer<T extends DomainEventType = DomainEventType> = (
  event: DomainEvent<T>,
) => Promise<void>

export interface EventEngine {
  /** Publish an event: persists to outbox + runs synchronous consumers.
   * Payload is checked against the event type via `DomainEventPayloads`. */
  publish<T extends DomainEventType>(event: Omit<DomainEvent<T>, 'id' | 'occurredAt'>): Promise<void>
  /** Register a synchronous in-process consumer for an event type. */
  subscribe<T extends DomainEventType>(type: T, consumer: EventConsumer<T>): void
  /** Drain undispatched outbox rows for async consumers (Vercel cron entry). */
  drainOutbox(): Promise<{ processed: number }>
}
