import { describe, it, expect } from 'vitest'
import { sortNotices, isForMyClass, unreadIds } from '@/lib/student/notices'

const n = (id: string, importance: string, created_at: string) => ({ id, importance, created_at })

describe('sortNotices', () => {
  it('puts urgency above recency', () => {
    // The point of marking a notice urgent: Monday's urgent still outranks
    // Friday's normal.
    const rows = [
      n('normal-friday', 'normal', '2026-08-28T09:00:00Z'),
      n('urgent-monday', 'urgent', '2026-08-24T09:00:00Z'),
      n('important-thu', 'important', '2026-08-27T09:00:00Z'),
    ]
    expect(sortNotices(rows).map((r) => r.id)).toEqual([
      'urgent-monday',
      'important-thu',
      'normal-friday',
    ])
  })

  it('breaks ties by newest first', () => {
    const rows = [
      n('older', 'normal', '2026-08-01T09:00:00Z'),
      n('newer', 'normal', '2026-08-09T09:00:00Z'),
    ]
    expect(sortNotices(rows).map((r) => r.id)).toEqual(['newer', 'older'])
  })

  it('treats an unrecognised importance as normal, never as urgent', () => {
    // A CHECK constraint on publications.importance means this cannot occur
    // today; the guarantee that matters is that a bad value can never jump
    // above a genuinely urgent notice.
    const rows = [
      n('weird', 'whatever', '2026-08-30T09:00:00Z'),
      n('urgent', 'urgent', '2026-08-01T09:00:00Z'),
      n('normal', 'normal', '2026-08-29T09:00:00Z'),
    ]
    const order = sortNotices(rows).map((r) => r.id)
    expect(order[0]).toBe('urgent')
    expect(order.slice(1)).toEqual(['weird', 'normal'])
  })

  it('does not mutate the caller’s array', () => {
    const rows = [n('a', 'normal', '2026-08-01T09:00:00Z'), n('b', 'urgent', '2026-08-02T09:00:00Z')]
    sortNotices(rows)
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('isForMyClass', () => {
  it('distinguishes a school-wide notice from a class one', () => {
    expect(isForMyClass({ target_type: 'all' })).toBe(false)
    expect(isForMyClass({ target_type: 'specific' })).toBe(true)
  })
})

describe('unreadIds', () => {
  it('returns what has not been opened', () => {
    const notices = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const receipts = [{ publication_id: 'b' }]
    expect(unreadIds(notices, receipts)).toEqual(['a', 'c'])
  })

  it('is empty when everything has been seen', () => {
    expect(unreadIds([{ id: 'a' }], [{ publication_id: 'a' }])).toEqual([])
  })
})
