import { describe, it, expect } from 'vitest'
import { withParams } from '@/lib/url-params'

describe('withParams (DataTable URL state)', () => {
  it('keeps existing params and sets the patch', () => {
    expect(withParams({ q: 'rahim', page: '3' }, { page: '4' })).toBe('?q=rahim&page=4')
  })
  it('drops page when a filter changes', () => {
    expect(withParams({ q: 'rahim', page: '3' }, { fee: 'due' })).toBe('?q=rahim&fee=due')
  })
  it('keeps page when opening or closing a record', () => {
    expect(withParams({ page: '3' }, { view: 'abc' })).toBe('?page=3&view=abc')
    expect(withParams({ page: '3', view: 'abc' }, { view: null })).toBe('?page=3')
  })
  it('deletes a key on null or empty', () => {
    expect(withParams({ q: 'rahim', fee: 'due' }, { fee: null })).toBe('?q=rahim')
    expect(withParams({ q: 'rahim' }, { q: '' })).toBe('?')
  })
  it('ignores undefined current values', () => {
    expect(withParams({ q: undefined }, { page: '2' })).toBe('?page=2')
  })
})
