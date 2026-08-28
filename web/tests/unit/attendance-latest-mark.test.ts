import { describe, expect, it } from 'vitest'
import { latestMark } from '@/lib/attendance-manual'

// #540: "nobody has taken this register" and "everyone was present" render the
// same roster. This is the function that tells them apart.
describe('latestMark', () => {
  it('returns null when nothing has been marked', () => {
    expect(latestMark([])).toBeNull()
  })

  it('ignores RFID rows, which carry no marked_at', () => {
    expect(latestMark([{ marked_by: null, marked_at: null }])).toBeNull()
  })

  it('picks the most recent mark across both tables', () => {
    const marks = [
      { marked_by: 'a', marked_at: '2026-08-28T09:00:00Z' },
      { marked_by: 'b', marked_at: '2026-08-28T10:42:00Z' },
      { marked_by: null, marked_at: null },
    ]
    expect(latestMark(marks)?.marked_by).toBe('b')
  })

  it('does not mutate its input', () => {
    const marks = [
      { marked_by: 'a', marked_at: '2026-08-28T09:00:00Z' },
      { marked_by: 'b', marked_at: '2026-08-28T10:42:00Z' },
    ]
    latestMark(marks)
    expect(marks[0].marked_by).toBe('a')
  })
})
