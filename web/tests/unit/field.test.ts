import { describe, it, expect } from 'vitest'
import { selectClass, dateInputClass, inputClass, filterButtonClass, FIELD_HEIGHT } from '@/components/ui/field'

// The select/date primitives replace ~10 near-duplicate ad-hoc class strings that
// had drifted apart across the app (issue #119). These lock the contract the
// call sites rely on: one shared look, three heights, opt-in full width.
describe('selectClass (issue #119)', () => {
  it('defaults to the shared field height (44px at every width) used by filter bars', () => {
    expect(FIELD_HEIGHT).toBe('h-11')
    expect(selectClass()).toContain(FIELD_HEIGHT)
    expect(selectClass()).toContain('text-sm')
  })
  it('supports the xs and md heights the app already uses', () => {
    expect(selectClass({ size: 'xs' })).toContain('h-8')
    expect(selectClass({ size: 'md' })).toContain(FIELD_HEIGHT)
  })
  it('is not full width unless asked', () => {
    expect(selectClass()).not.toContain('w-full')
    expect(selectClass({ fullWidth: true })).toContain('w-full')
  })
  it('reserves right padding for the chevron drawn by the base-layer rule', () => {
    // A `px-*` utility here would paint long option labels under the chevron.
    expect(selectClass()).toContain('pr-9')
    expect(selectClass()).toContain('pl-3')
    expect(selectClass()).not.toMatch(/\bpx-\d/)
  })
  it('carries the Family border, focus ring and disabled treatment', () => {
    const c = selectClass()
    expect(c).toContain('border-line-strong')
    expect(c).toContain('focus-visible:ring-brand-300')
    expect(c).toContain('disabled:opacity-60')
  })
})

describe('dateInputClass (issue #119)', () => {
  it('shares the select chrome so a date field matches the select beside it', () => {
    const [s, d] = [selectClass(), dateInputClass()]
    for (const token of ['rounded-md', 'border-line-strong', 'bg-paper', FIELD_HEIGHT, 'focus-visible:ring-brand-300']) {
      expect(s).toContain(token)
      expect(d).toContain(token)
    }
  })
  it('uses symmetric padding — there is no chevron to clear', () => {
    expect(dateInputClass()).toContain('px-3')
  })
  it('honours size and fullWidth', () => {
    expect(dateInputClass({ size: 'md', fullWidth: true })).toContain(FIELD_HEIGHT)
    expect(dateInputClass({ size: 'md', fullWidth: true })).toContain('w-full')
  })
})

describe('filter bar set', () => {
  it('text inputs and the Filter button share the select height, radius and border', () => {
    for (const c of [inputClass(), filterButtonClass()]) {
      for (const token of [FIELD_HEIGHT, 'rounded-md', 'border-line-strong', 'bg-paper']) expect(c).toContain(token)
    }
    expect(filterButtonClass({ fullWidth: true })).toContain('w-full')
  })
})
