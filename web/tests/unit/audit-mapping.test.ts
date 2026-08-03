import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '@/lib/engines/events'
import { eventToAuditEntry } from '@/lib/engines/audit/engine'

// Pure domain-event -> audit-entry mapping (#261).
describe('eventToAuditEntry', () => {
  const event: DomainEvent = {
    id: 'evt-1',
    type: 'InvoicePaid',
    schoolId: 'school-1',
    payload: { invoiceId: 'inv-9', amount: 1000 },
    occurredAt: '2026-08-02T00:00:00Z',
    actorId: 'user-7',
  }

  it('records the event as an immutable create with the event id as entity id', () => {
    expect(eventToAuditEntry(event)).toEqual({
      actorId: 'user-7',
      schoolId: 'school-1',
      entityType: 'domain_event',
      entityId: 'evt-1',
      action: 'create',
      before: null,
      after: { type: 'InvoicePaid', payload: { invoiceId: 'inv-9', amount: 1000 } },
      ip: null,
      requestId: null,
    })
  })

  it('preserves null tenant/actor for platform events', () => {
    const entry = eventToAuditEntry({ ...event, schoolId: null, actorId: null })
    expect(entry.schoolId).toBeNull()
    expect(entry.actorId).toBeNull()
  })
})
