import { beforeEach, describe, expect, it } from 'vitest'
import { consumersFor, resetRegistry, subscribe } from '@/lib/engines/events/registry'

// Pure in-process consumer registry for the Event engine (#260).
describe('event consumer registry', () => {
  beforeEach(resetRegistry)

  it('returns no consumers for an unregistered type', () => {
    expect(consumersFor('InvoicePaid')).toEqual([])
  })

  it('registers a consumer for a type', () => {
    const c = async () => {}
    subscribe('SchoolCreated', c)
    expect(consumersFor('SchoolCreated')).toEqual([c])
  })

  it('keeps multiple consumers for one type in registration order', () => {
    const first = async () => {}
    const second = async () => {}
    subscribe('SmsPurchased', first)
    subscribe('SmsPurchased', second)
    expect(consumersFor('SmsPurchased')).toEqual([first, second])
  })

  it('isolates consumers by type', () => {
    subscribe('SchoolCreated', async () => {})
    expect(consumersFor('SmsPurchased')).toEqual([])
  })

  it('reset clears all registrations', () => {
    subscribe('SchoolCreated', async () => {})
    resetRegistry()
    expect(consumersFor('SchoolCreated')).toEqual([])
  })
})
