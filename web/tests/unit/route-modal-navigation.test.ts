import { describe, it, expect } from 'vitest'
import { sameRouteNavigation } from '@/components/route-modal'

// #701: a page moving to another address of its own route (marks entry
// switching subject). Inside the popup a soft navigation replaces the popup's
// content; on the full page it would be intercepted and open a popup.
describe('sameRouteNavigation', () => {
  it('is a full load on the page itself', () => {
    expect(sameRouteNavigation(false)).toBe('full')
  })
  it('stays soft inside the route popup', () => {
    expect(sameRouteNavigation(true)).toBe('soft')
  })
})
