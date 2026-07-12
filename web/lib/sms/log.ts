// SMS send-log aggregation (PRD §5.7 "send summary/log"). sms_log holds one
// row per recipient (both the manual-compose path and the absence-rule cron
// share the table — see 0021/0047 migrations); the log screen groups rows
// back into one row per send action via batch_id, and totals a date range
// across BOTH manual and automated (`kind`) sends. Pure so the grouping/sum
// logic is unit-testable without a database.

export type SmsLogKind = 'manual' | 'absence_auto'
export type SmsLogStatus = 'sent' | 'failed'

export interface SmsLogRow {
  id: string
  batch_id: string
  kind: SmsLogKind
  recipient_label: string | null
  body: string
  segments: number
  status: SmsLogStatus
  created_at: string
}

export interface SmsLogBatch {
  batchId: string
  kind: SmsLogKind
  recipientLabel: string | null
  sentAt: string
  bodyPreview: string
  recipients: number
  segments: number
  failed: boolean
}

/** One row per send action (batch_id), newest first. `recipients` counts the
 *  rows in the batch, but `segments` is the per-message segment count (every
 *  recipient in a batch gets the identical composed message, so it is NOT
 *  summed across recipients — that would report e.g. a 42-recipient,
 *  1-segment send as "42 segments", which the mockup's Recipients=42/
 *  Segments=1 example rules out). A batch reads as "Failed" if any
 *  recipient in it failed. */
export function aggregateSmsLog(rows: SmsLogRow[]): SmsLogBatch[] {
  const batches = new Map<string, SmsLogRow[]>()
  for (const row of rows) {
    const list = batches.get(row.batch_id)
    if (list) list.push(row)
    else batches.set(row.batch_id, [row])
  }

  return [...batches.values()]
    .map((list) => {
      const earliest = list.reduce((min, r) => (r.created_at < min.created_at ? r : min))
      return {
        batchId: earliest.batch_id,
        kind: earliest.kind,
        recipientLabel: earliest.recipient_label,
        sentAt: earliest.created_at,
        bodyPreview: earliest.body,
        recipients: list.length,
        segments: Math.max(...list.map((r) => r.segments)),
        failed: list.some((r) => r.status === 'failed'),
      }
    })
    .sort((a, b) => (a.sentAt < b.sentAt ? 1 : a.sentAt > b.sentAt ? -1 : 0))
}

export interface SmsLogTotals {
  totalSent: number
  totalSegments: number
  totalFailed: number
}

/** Date-range totals across every row regardless of batch — "Total Sent"
 *  counts individual recipient-sends (matches the mockup's KPI numbers, which
 *  are recipient counts, not batch counts). */
export function summarizeSmsLog(rows: SmsLogRow[]): SmsLogTotals {
  return rows.reduce<SmsLogTotals>(
    (acc, row) => ({
      totalSent: acc.totalSent + 1,
      totalSegments: acc.totalSegments + row.segments,
      totalFailed: acc.totalFailed + (row.status === 'failed' ? 1 : 0),
    }),
    { totalSent: 0, totalSegments: 0, totalFailed: 0 },
  )
}
