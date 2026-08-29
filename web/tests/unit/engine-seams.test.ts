// Characterization anchor for the engine seams landed in #259 (map #258).
// Seams are interface-only; the one runtime artifact is the domain-event
// catalog, whose stability every later engine phase depends on. This pins it.
import { describe, expect, it } from 'vitest'
import { DOMAIN_EVENT_TYPES } from '@/lib/engines/events'

describe('domain event catalog (engine seam)', () => {
  it('has no duplicate event types', () => {
    expect(new Set(DOMAIN_EVENT_TYPES).size).toBe(DOMAIN_EVENT_TYPES.length)
  })

  it('includes the cross-engine events later phases subscribe to', () => {
    for (const t of ['InvoicePaid', 'SmsPurchased', 'CommissionCalculated', 'WorkflowCompleted']) {
      expect(DOMAIN_EVENT_TYPES).toContain(t)
    }
  })

  it('event types are PascalCase business events, not technical operations', () => {
    for (const t of DOMAIN_EVENT_TYPES) {
      expect(t).toMatch(/^[A-Z][A-Za-z]+$/)
    }
  })
})
