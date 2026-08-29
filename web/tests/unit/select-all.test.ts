import { describe, expect, it } from 'vitest'
import { selectAllRows, POSTGREST_PAGE_CAP } from '@/lib/supabase/select-all'

/** A fake table of `total` rows that honours the requested range, like PostgREST. */
function table(total: number) {
  const calls: [number, number][] = []
  const page = async (from: number, to: number) => {
    calls.push([from, to])
    return {
      data: Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({ i: from + i })),
      error: null,
    }
  }
  return { page, calls }
}

describe('selectAllRows', () => {
  it('returns everything past the cap, which an unbounded select would not', async () => {
    const { rows } = await selectAllRows(table(2500).page, 1000)
    expect(rows).toHaveLength(2500)
  })

  it('stops on a short page rather than asking for a count first', async () => {
    const t = table(1500)
    await selectAllRows(t.page, 1000)
    // Two pages: 0-999 returns a full page, 1000-1999 returns 500 and ends it.
    expect(t.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  // The boundary that matters: exactly one full page looks identical to a
  // truncated one, so it must ask again before concluding it is done.
  it('asks again when the first page is exactly full', async () => {
    const t = table(1000)
    const { rows } = await selectAllRows(t.page, 1000)
    expect(rows).toHaveLength(1000)
    expect(t.calls).toHaveLength(2)
  })

  it('handles an empty table in one call', async () => {
    const t = table(0)
    const { rows } = await selectAllRows(t.page, 1000)
    expect(rows).toEqual([])
    expect(t.calls).toHaveLength(1)
  })

  it('reports an error and keeps what it already read', async () => {
    let n = 0
    const { rows, error } = await selectAllRows(async (from, to) => {
      if (n++ === 0) return { data: Array.from({ length: 1000 }, (_, i) => ({ i })), error: null }
      return { data: null, error: { message: 'boom' } }
    }, 1000)
    expect(error).toBe('boom')
    expect(rows).toHaveLength(1000)
  })

  it('defaults to the cap PostgREST actually applies', () => {
    expect(POSTGREST_PAGE_CAP).toBe(1000)
  })
})
