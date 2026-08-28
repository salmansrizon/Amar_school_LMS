import { describe, expect, it } from 'vitest'
import { summarizeEvents, oldestQueuedMinutes, type DomainEventRow } from '@/lib/super-admin/job-monitor'

const at = (iso: string, over: Partial<DomainEventRow> = {}): DomainEventRow => ({
  id: iso,
  type: 'InvoiceGenerated',
  attempts: 0,
  dispatched_at: null,
  occurred_at: iso,
  ...over,
})

describe('summarizeEvents', () => {
  // The UAT pass called the monitor "flooded with repeated InvoiceGenerated rows".
  // They were not repeats — 1,276 InvoiceGenerated events exist for 1,276 numbered
  // invoices, one each. The complaint underneath is still right: fifty lines that
  // differ only by timestamp say nothing.
  it('collapses many events of one type into a single line', () => {
    const rows = ['2026-08-28T09:00:00Z', '2026-08-28T09:01:00Z', '2026-08-28T09:02:00Z'].map((t) => at(t))
    const [summary] = summarizeEvents(rows)
    expect(summary.type).toBe('InvoiceGenerated')
    expect(summary.total).toBe(3)
    expect(summary.queued).toBe(3)
  })

  it('counts dispatched separately from queued', () => {
    const rows = [
      at('2026-08-28T09:00:00Z', { dispatched_at: '2026-08-28T09:00:05Z' }),
      at('2026-08-28T09:01:00Z'),
    ]
    const [summary] = summarizeEvents(rows)
    expect(summary.total).toBe(2)
    expect(summary.queued).toBe(1)
  })

  // The operator's question is "what is stuck", not "what happened last".
  it('puts types with a backlog first, oldest backlog first', () => {
    const rows = [
      at('2026-08-28T11:00:00Z', { type: 'RecentButQueued' }),
      at('2026-08-28T08:00:00Z', { type: 'OldAndQueued' }),
      at('2026-08-28T12:00:00Z', { type: 'AllDone', dispatched_at: '2026-08-28T12:00:01Z' }),
    ]
    expect(summarizeEvents(rows).map((s) => s.type)).toEqual(['OldAndQueued', 'RecentButQueued', 'AllDone'])
  })

  it('reports the highest attempt count among the queued rows only', () => {
    const rows = [
      at('2026-08-28T09:00:00Z', { attempts: 7, dispatched_at: '2026-08-28T09:00:05Z' }),
      at('2026-08-28T09:01:00Z', { attempts: 2 }),
    ]
    // A dispatched row's tries are history; only a stuck row's tries are a signal.
    expect(summarizeEvents(rows)[0].maxAttempts).toBe(2)
  })
})

describe('oldestQueuedMinutes', () => {
  // 96 events queued for six seconds is a dispatcher mid-run; 96 queued for six
  // hours is a dispatcher that is not running. The page showed only the count, so
  // the two were indistinguishable — which is the actual defect behind #537.
  it('measures the backlog in time, not just depth', () => {
    const rows = [at('2026-08-28T09:00:00Z'), at('2026-08-28T11:00:00Z')]
    expect(oldestQueuedMinutes(rows, new Date('2026-08-28T12:00:00Z'))).toBe(180)
  })

  it('ignores dispatched rows however old they are', () => {
    const rows = [at('2020-01-01T00:00:00Z', { dispatched_at: '2020-01-01T00:00:01Z' })]
    expect(oldestQueuedMinutes(rows, new Date('2026-08-28T12:00:00Z'))).toBeNull()
  })

  it('is null when nothing is queued', () => {
    expect(oldestQueuedMinutes([], new Date())).toBeNull()
  })
})
