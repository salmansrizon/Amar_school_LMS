import { describe, it, expect } from 'vitest'
import { createRfidSaveQueue } from '@/lib/rfid-save-queue'
import type { RfidEntry, RfidSaveResult } from '@/lib/machine-enrollment-store'

// The background save queue behind rapid RFID entry (issue #675): no entry
// is ever lost, writes for one person never race, failures retry, and
// database answers (duplicates) wait for the operator.

interface Call {
  entries: RfidEntry[]
  resolve: (results: RfidSaveResult[]) => void
  reject: (err: unknown) => void
}

function harness(options: { batchSize?: number } = {}) {
  const calls: Call[] = []
  let inFlight = 0
  let maxInFlight = 0
  const timers: { fn: () => void; ms: number }[] = []
  const queue = createRfidSaveQueue({
    batchSize: options.batchSize,
    retryDelays: [100, 200],
    send: (entries) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      return new Promise((resolve, reject) => {
        calls.push({
          entries,
          resolve: (r) => {
            inFlight--
            resolve(r)
          },
          reject: (e) => {
            inFlight--
            reject(e)
          },
        })
      })
    },
    setTimer: (fn, ms) => {
      timers.push({ fn, ms })
      return timers.length
    },
    clearTimer: () => {},
  })
  const okAll = (call: Call): RfidSaveResult[] =>
    call.entries.map((e) => ({ personId: e.personId, ok: true as const, card: e.card }))
  const flush = () => new Promise((r) => setTimeout(r, 0))
  return { queue, calls, timers, okAll, flush, maxInFlight: () => maxInFlight }
}

const entry = (personId: string, card: string | null): RfidEntry => ({ kind: 'student', personId, card })

describe('rfid save queue', () => {
  it('sends the first entry at once and batches the ones typed while it is in flight', async () => {
    const h = harness()
    h.queue.enqueue(entry('s1', '0001'))
    h.queue.enqueue(entry('s2', '0002'))
    h.queue.enqueue(entry('s3', '0003'))
    expect(h.calls).toHaveLength(1)
    expect(h.calls[0].entries.map((e) => e.personId)).toEqual(['s1'])
    expect(h.queue.state('s2')?.status).toBe('queued')

    h.calls[0].resolve(h.okAll(h.calls[0]))
    await h.flush()
    expect(h.calls).toHaveLength(2)
    expect(h.calls[1].entries.map((e) => e.personId)).toEqual(['s2', 's3'])
    h.calls[1].resolve(h.okAll(h.calls[1]))
    await h.flush()

    expect(['s1', 's2', 's3'].map((id) => h.queue.state(id)?.status)).toEqual(['saved', 'saved', 'saved'])
    expect(h.queue.pendingCount()).toBe(0)
    expect(h.maxInFlight()).toBe(1)
  })

  it('keeps a rapid burst of hundreds of entries, in batches, none lost', async () => {
    const h = harness({ batchSize: 25 })
    for (let i = 0; i < 300; i++) h.queue.enqueue(entry(`s${i}`, String(i).padStart(8, '0')))
    while (h.queue.pendingCount() > 0) {
      const call = h.calls[h.calls.length - 1]
      call.resolve(h.okAll(call))
      await h.flush()
    }
    const sent = h.calls.flatMap((c) => c.entries)
    expect(sent).toHaveLength(300)
    expect(new Set(sent.map((e) => e.personId)).size).toBe(300)
    expect(h.queue.state('s7')).toEqual({ status: 'saved', card: '00000007' })
    expect(h.maxInFlight()).toBe(1)
  })

  it('coalesces edits to one row and writes the latest value last', async () => {
    const h = harness()
    h.queue.enqueue(entry('s1', 'A'))
    h.queue.enqueue(entry('s1', 'B'))
    h.queue.enqueue(entry('s1', 'C'))
    // 'A' is in flight; 'B' was replaced by 'C' before it was ever sent.
    h.calls[0].resolve(h.okAll(h.calls[0]))
    await h.flush()
    // The in-flight 'A' result must not overwrite the newer queued value.
    expect(h.calls).toHaveLength(2)
    expect(h.calls[1].entries).toEqual([entry('s1', 'C')])
    h.calls[1].resolve(h.okAll(h.calls[1]))
    await h.flush()
    expect(h.queue.state('s1')).toEqual({ status: 'saved', card: 'C' })
  })

  it('carries a clear (null) through like any other value', async () => {
    const h = harness()
    h.queue.enqueue(entry('s1', null))
    h.calls[0].resolve(h.okAll(h.calls[0]))
    await h.flush()
    expect(h.queue.state('s1')).toEqual({ status: 'saved', card: null })
  })

  it('keeps entries through a network failure and retries them after a backoff', async () => {
    const h = harness()
    h.queue.enqueue(entry('s1', '0001'))
    h.calls[0].reject(new Error('offline'))
    await h.flush()
    expect(h.queue.state('s1')?.status).toBe('retrying')
    expect(h.queue.pendingCount()).toBe(1)
    expect(h.timers.map((t) => t.ms)).toEqual([100])

    // Typing continues while offline: queued, not sent until the retry.
    h.queue.enqueue(entry('s2', '0002'))
    expect(h.calls).toHaveLength(1)

    h.timers[0].fn()
    expect(h.calls).toHaveLength(2)
    expect(h.calls[1].entries.map((e) => e.personId)).toEqual(['s1', 's2'])
    h.calls[1].reject(new Error('still offline'))
    await h.flush()
    expect(h.timers.map((t) => t.ms)).toEqual([100, 200])

    h.timers[1].fn()
    h.calls[2].resolve(h.okAll(h.calls[2]))
    await h.flush()
    expect(h.queue.state('s1')?.status).toBe('saved')
    expect(h.queue.state('s2')?.status).toBe('saved')
    expect(h.queue.pendingCount()).toBe(0)
  })

  it('lets the operator retry a waiting row immediately', async () => {
    const h = harness()
    h.queue.enqueue(entry('s1', '0001'))
    h.calls[0].reject(new Error('offline'))
    await h.flush()
    h.queue.retry('s1')
    expect(h.calls).toHaveLength(2)
  })

  it('does not retry a duplicate on its own; retry() sends it again', async () => {
    const h = harness()
    h.queue.enqueue(entry('s1', '0001'))
    h.calls[0].resolve([{ personId: 's1', ok: false, error: 'duplicate', holder: 'Rahim' }])
    await h.flush()
    expect(h.queue.state('s1')).toEqual({ status: 'duplicate', card: '0001', holder: 'Rahim' })
    expect(h.queue.failedCount()).toBe(1)
    expect(h.timers).toHaveLength(0)
    expect(h.calls).toHaveLength(1)

    h.queue.retry('s1')
    expect(h.calls).toHaveLength(2)
    expect(h.calls[1].entries).toEqual([entry('s1', '0001')])
  })

  it('treats an entry the server skipped as failed, not saved', async () => {
    const h = harness()
    h.queue.enqueue(entry('s1', '0001'))
    h.calls[0].resolve([])
    await h.flush()
    expect(h.queue.state('s1')?.status).toBe('error')
  })

  it('retryAll re-sends every failed row in one batch', async () => {
    const h = harness()
    h.queue.enqueue(entry('s1', '0001'))
    h.calls[0].resolve([{ personId: 's1', ok: false, error: 'failed' }])
    await h.flush()
    h.queue.enqueue(entry('s2', '0002'))
    h.calls[1].resolve([{ personId: 's2', ok: false, error: 'duplicate' }])
    await h.flush()
    expect(h.queue.failedCount()).toBe(2)

    h.queue.retryAll()
    expect(h.calls[2].entries.map((e) => e.personId)).toEqual(['s1', 's2'])
  })

  it('publishes a new immutable snapshot on every change, counting in-flight writes as pending', async () => {
    // The screen renders only from snapshots: the app's React Compiler
    // memoizes on identity, so a snapshot must be a new object whenever
    // anything changes, and must never report "nothing pending" while a
    // write is still in flight.
    const h = harness()
    const first = h.queue.snapshot()
    h.queue.enqueue(entry('s1', '0001'))
    h.queue.enqueue(entry('s2', '0002'))
    const during = h.queue.snapshot()
    expect(during).not.toBe(first)
    expect(during.pendingCount).toBe(2)
    expect(during.states.get('s1')?.status).toBe('saving')

    h.calls[0].resolve(h.okAll(h.calls[0]))
    await h.flush()
    // s1 done, s2 now in flight: still pending.
    expect(h.queue.snapshot().pendingCount).toBe(1)
    expect(during.states.get('s1')?.status).toBe('saving') // old snapshot untouched

    h.calls[1].resolve(h.okAll(h.calls[1]))
    await h.flush()
    expect(h.queue.snapshot().pendingCount).toBe(0)
    expect(h.queue.snapshot().states.get('s2')?.status).toBe('saved')
  })

  it('notifies subscribers on every change', () => {
    const h = harness()
    let notified = 0
    const unsubscribe = h.queue.subscribe(() => notified++)
    const before = h.queue.version()
    h.queue.enqueue(entry('s1', '0001'))
    expect(notified).toBeGreaterThan(0)
    expect(h.queue.version()).toBeGreaterThan(before)
    unsubscribe()
  })
})
