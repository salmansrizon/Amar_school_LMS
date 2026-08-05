import { describe, it, expect } from 'vitest'
import { nextSeq } from '@/lib/super-admin/workflows'

describe('nextSeq', () => {
  it('is 1 for a definition with no stages', () => {
    expect(nextSeq([])).toBe(1)
  })
  it('is max + 1 so re-ordering gaps never collide with the unique (def, seq)', () => {
    expect(nextSeq([1, 2, 4])).toBe(5)
  })
})
