export interface DomainEventRow {
  id: string
  type: string
  attempts: number
  dispatched_at: string | null
  occurred_at: string
}

export interface EventTypeSummary {
  type: string
  total: number
  queued: number
  /** Highest attempt count seen on a still-queued row of this type. */
  maxAttempts: number
  /** ISO timestamp of the oldest still-queued row, or null when none are queued. */
  oldestQueued: string | null
}

/** Fold recent domain events into one row per type.
 *
 *  The UAT pass reported the monitor as "flooded with repeated InvoiceGenerated,
 *  0, queued rows". The rows were not repeats — they were 50 distinct events that
 *  happen to share a type, and the `0` was the Tries column, not an item count.
 *  But the complaint underneath is right: fifty lines that differ only by
 *  timestamp tell an operator nothing, and they bury the one type that is
 *  actually stuck.
 *
 *  One line per type, carrying the two things that decide whether to act: how
 *  many are still queued, and how long the oldest has been waiting. */
export function summarizeEvents(rows: DomainEventRow[]): EventTypeSummary[] {
  const byType = new Map<string, EventTypeSummary>()

  for (const row of rows) {
    const summary = byType.get(row.type) ?? {
      type: row.type,
      total: 0,
      queued: 0,
      maxAttempts: 0,
      oldestQueued: null,
    }
    summary.total += 1
    if (!row.dispatched_at) {
      summary.queued += 1
      summary.maxAttempts = Math.max(summary.maxAttempts, row.attempts)
      if (!summary.oldestQueued || row.occurred_at < summary.oldestQueued) {
        summary.oldestQueued = row.occurred_at
      }
    }
    byType.set(row.type, summary)
  }

  // Anything queued first, oldest backlog first within that — the operator's
  // question is "what is stuck", not "what happened most recently".
  return [...byType.values()].sort(
    (a, b) =>
      Number(b.queued > 0) - Number(a.queued > 0) ||
      (a.oldestQueued ?? '').localeCompare(b.oldestQueued ?? '') ||
      b.total - a.total,
  )
}

/** How long the oldest queued event has been waiting, in whole minutes.
 *
 *  A queue depth on its own does not say whether anything is wrong: 96 events
 *  queued for six seconds is a healthy dispatcher mid-run, and 96 queued for six
 *  hours is a dispatcher that is not running at all. The page showed only the
 *  count, so those two looked identical. */
export function oldestQueuedMinutes(rows: DomainEventRow[], now: Date): number | null {
  const queued = rows.filter((r) => !r.dispatched_at)
  if (!queued.length) return null
  const oldest = queued.reduce((min, r) => (r.occurred_at < min ? r.occurred_at : min), queued[0].occurred_at)
  return Math.max(0, Math.floor((now.getTime() - new Date(oldest).getTime()) / 60000))
}
