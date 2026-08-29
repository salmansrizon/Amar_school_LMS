import { describe, expect, it } from 'vitest'

// #531: the collection form is built only when a class resolves — the roster, the
// record map and the form all hang off it. So any URL that reaches this page
// without `class` shows a student selected, no roster, and no form.
//
// That was the actual defect behind the UAT report's "fee collection form never
// appears" release blocker: the race-recovery path in fee-form.tsx pushed
// `/school/fees?student=…&month=…&year=…` and dropped the class.
//
// This pins the rule the page depends on, so the next person adding a link here
// finds out from a test rather than from a UAT pass.
function rendersCollectionForm(url: string): boolean {
  const params = new URL(url, 'https://school.example').searchParams
  return Boolean(params.get('class')) && Boolean(params.get('student'))
}

describe('a fee collection URL needs its class (#531)', () => {
  it('renders the form when class and student are both present', () => {
    expect(rendersCollectionForm('/school/fees?class=abc&month=8&year=2026&student=xyz#collect-form')).toBe(true)
  })

  it('does NOT render the form when the class is missing — the old race-recovery push', () => {
    expect(rendersCollectionForm('/school/fees?student=xyz&month=8&year=2026')).toBe(false)
  })

  it('does not render the form for a class with nobody selected', () => {
    expect(rendersCollectionForm('/school/fees?class=abc&month=8&year=2026')).toBe(false)
  })
})
