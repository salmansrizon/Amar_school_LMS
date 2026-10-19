import { describe, it, expect } from 'vitest'
import { isUnpublished, publishToggle } from '@/lib/school/publication-status'

describe('publication status (#696)', () => {
  it('null, undefined and empty read as published', () => {
    expect(isUnpublished(null)).toBe(false)
    expect(isUnpublished(undefined)).toBe(false)
    expect(isUnpublished('')).toBe(false)
    expect(isUnpublished('2026-10-07T10:00:00Z')).toBe(true)
  })
  it('a notice offers unpublish, then republish', () => {
    expect(publishToggle('notice', null)).toBe('unpublish')
    expect(publishToggle('notice', '2026-10-07T10:00:00Z')).toBe('republish')
  })
  it('no toggle while the column is missing, or for other kinds', () => {
    expect(publishToggle('notice', undefined)).toBeNull()
    expect(publishToggle('homework', null)).toBeNull()
    expect(publishToggle('lesson_plan', '2026-10-07T10:00:00Z')).toBeNull()
  })
})
