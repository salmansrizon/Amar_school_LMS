// In-process consumer registry for the Event engine (map #258, #260).
// Consumers are registered once at module load and run synchronously after a
// publish, and again by the cron drain for undispatched rows. They MUST be
// idempotent on `event.id` (at-least-once delivery).
import type { DomainEventType, EventConsumer } from './index'

const registry = new Map<DomainEventType, EventConsumer[]>()

/** Register a synchronous in-process consumer for an event type. */
export function subscribe<T extends DomainEventType>(type: T, consumer: EventConsumer<T>): void {
  const list = registry.get(type) ?? []
  list.push(consumer as EventConsumer)
  registry.set(type, list)
}

/** Consumers registered for an event type (empty array if none). */
export function consumersFor(type: DomainEventType): EventConsumer[] {
  return registry.get(type) ?? []
}

/** Test-only: drop all registrations so suites don't leak into each other. */
export function resetRegistry(): void {
  registry.clear()
}
