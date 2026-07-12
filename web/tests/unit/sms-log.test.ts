import { describe, it, expect } from 'vitest'
import { aggregateSmsLog, summarizeSmsLog, type SmsLogRow } from '@/lib/sms/log'

// SMS log date-range aggregation (issue #36, PRD §5.7 "send summary/log with
// date-range totals"). sms_log is one row per recipient for both manual
// composes and the automated absence-rule cron; the log screen groups by
// batch_id back into one row per send action and totals combine both kinds.

const row = (over: Partial<SmsLogRow>): SmsLogRow => ({
  id: over.id ?? 'r1',
  batch_id: 'b1',
  kind: 'manual',
  recipient_label: 'Class 6 / A',
  body: 'hello',
  segments: 1,
  status: 'sent',
  created_at: '2026-07-05T09:10:00Z',
  ...over,
})

describe('aggregateSmsLog', () => {
  it('groups rows sharing a batch_id into one row, counting recipients and summing segments', () => {
    const rows = [
      row({ id: 'r1', batch_id: 'b1', segments: 1 }),
      row({ id: 'r2', batch_id: 'b1', segments: 2 }),
    ]
    const batches = aggregateSmsLog(rows)
    expect(batches).toHaveLength(1)
    expect(batches[0]).toMatchObject({ batchId: 'b1', recipients: 2, segments: 3, failed: false })
  })

  it('a batch is "failed" if any recipient in it failed', () => {
    const rows = [
      row({ id: 'r1', batch_id: 'b1', status: 'sent' }),
      row({ id: 'r2', batch_id: 'b1', status: 'failed' }),
    ]
    expect(aggregateSmsLog(rows)[0].failed).toBe(true)
  })

  it('keeps manual and automated (absence_auto) sends as separate batches', () => {
    const rows = [
      row({ id: 'r1', batch_id: 'b1', kind: 'manual', recipient_label: 'Class 6 / A' }),
      row({ id: 'r2', batch_id: 'b2', kind: 'absence_auto', recipient_label: null }),
    ]
    const batches = aggregateSmsLog(rows)
    expect(batches).toHaveLength(2)
    expect(batches.map((b) => b.kind).sort()).toEqual(['absence_auto', 'manual'])
  })

  it('orders batches newest-first by sent time', () => {
    const rows = [
      row({ id: 'r1', batch_id: 'older', created_at: '2026-07-01T00:00:00Z' }),
      row({ id: 'r2', batch_id: 'newer', created_at: '2026-07-05T00:00:00Z' }),
    ]
    expect(aggregateSmsLog(rows).map((b) => b.batchId)).toEqual(['newer', 'older'])
  })

  it('no rows yields no batches', () => {
    expect(aggregateSmsLog([])).toEqual([])
  })
})

describe('summarizeSmsLog', () => {
  it('totals sent/segments/failed across every recipient row (not per batch)', () => {
    const rows = [
      row({ id: 'r1', batch_id: 'b1', segments: 1, status: 'sent' }),
      row({ id: 'r2', batch_id: 'b1', segments: 2, status: 'sent' }),
      row({ id: 'r3', batch_id: 'b2', segments: 1, status: 'failed' }),
    ]
    expect(summarizeSmsLog(rows)).toEqual({ totalSent: 3, totalSegments: 4, totalFailed: 1 })
  })

  it('an empty date range totals to zero', () => {
    expect(summarizeSmsLog([])).toEqual({ totalSent: 0, totalSegments: 0, totalFailed: 0 })
  })
})
