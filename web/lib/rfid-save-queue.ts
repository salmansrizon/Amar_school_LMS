import type { RfidEntry, RfidSaveResult } from '@/lib/machine-enrollment-store'

// Background persistence for rapid RFID entry (issue #675). An operator may
// scan hundreds of cards in a row, so a save must never make them wait — but
// a card must never be silently dropped either. The queue:
//
//   * coalesces per person: a second edit to a row that has not been sent yet
//     replaces the first, so only the latest value is ever written;
//   * sends one batch at a time, so two writes for the same person can never
//     race each other and finish out of order;
//   * retries a failed request (network down, server error) with backoff and
//     keeps the entries queued meanwhile — nothing is lost while it waits;
//   * never retries an answer from the database (a duplicate card, a person
//     who no longer exists): those wait for the operator, with retry().
//
// Framework-free, so the scheduling rules are unit-tested directly; the UI
// subscribes through useSyncExternalStore.

export type RfidRowStatus = 'queued' | 'saving' | 'retrying' | 'saved' | 'duplicate' | 'error'

export interface RfidRowState {
  status: RfidRowStatus
  /** The value being saved, or last attempted. */
  card: string | null
  /** For 'duplicate': who holds the card, when readable. */
  holder?: string | null
  /** For 'error': the store's error code. */
  error?: string
}

/** An immutable picture of the queue, replaced on every change. Screens must
 *  render from this, never from the queue's live methods: the app compiles
 *  with the React Compiler, which memoizes on object identity, and the queue
 *  object itself never changes identity. */
export interface RfidQueueSnapshot {
  version: number
  states: ReadonlyMap<string, RfidRowState>
  pendingCount: number
  failedCount: number
}

export const EMPTY_RFID_SNAPSHOT: RfidQueueSnapshot = { version: 0, states: new Map(), pendingCount: 0, failedCount: 0 }

export interface RfidSaveQueue {
  enqueue(entry: RfidEntry): void
  /** Re-send a row that ended in 'duplicate' or 'error', or send a waiting
   *  retry now rather than after its backoff. */
  retry(personId: string): void
  retryAll(): void
  state(personId: string): RfidRowState | undefined
  /** Entries not yet confirmed by the server (queued, saving or retrying). */
  pendingCount(): number
  failedCount(): number
  subscribe(listener: () => void): () => void
  /** Increments on every change. */
  version(): number
  /** The useSyncExternalStore snapshot. */
  snapshot(): RfidQueueSnapshot
}

export interface RfidSaveQueueOptions {
  send: (entries: RfidEntry[]) => Promise<RfidSaveResult[]>
  batchSize?: number
  /** Backoff between retries of a failed request; the last delay repeats. */
  retryDelays?: readonly number[]
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export function createRfidSaveQueue({
  send,
  batchSize = 25,
  retryDelays = [1000, 2000, 4000, 8000, 15000],
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}: RfidSaveQueueOptions): RfidSaveQueue {
  // Keyed by person id. A Map keeps insertion order, so batches go out in the
  // order rows were entered.
  const pending = new Map<string, RfidEntry>()
  const inFlight = new Map<string, RfidEntry>()
  const states = new Map<string, RfidRowState>()
  const lastEntry = new Map<string, RfidEntry>()
  const listeners = new Set<() => void>()
  let failures = 0
  let retryTimer: unknown = null
  let ver = 0
  let snap: RfidQueueSnapshot = EMPTY_RFID_SNAPSHOT

  const isFailedState = (s: RfidRowState) => s.status === 'duplicate' || s.status === 'error'

  function changed() {
    ver++
    snap = {
      version: ver,
      states: new Map(states),
      pendingCount: pending.size + inFlight.size,
      failedCount: [...states.values()].filter(isFailedState).length,
    }
    for (const l of listeners) l()
  }

  function setState(personId: string, next: RfidRowState) {
    states.set(personId, next)
  }

  function pump() {
    if (inFlight.size || retryTimer !== null || !pending.size) return
    const batch: RfidEntry[] = []
    for (const [id, entry] of pending) {
      batch.push(entry)
      inFlight.set(id, entry)
      pending.delete(id)
      setState(id, { status: 'saving', card: entry.card })
      if (batch.length >= batchSize) break
    }
    changed()

    send(batch).then(
      (results) => {
        failures = 0
        const byId = new Map(results.map((r) => [r.personId, r]))
        for (const entry of batch) {
          inFlight.delete(entry.personId)
          // A newer edit arrived while this one was in flight: it is already
          // queued and its own state stands. Writes for one person go out one
          // batch at a time, so the newer value is written last.
          if (pending.has(entry.personId)) continue
          const result = byId.get(entry.personId)
          if (!result) {
            // The server answered but skipped this entry — treat as failed
            // rather than assume it was written.
            setState(entry.personId, { status: 'error', card: entry.card, error: 'failed' })
          } else if (result.ok) {
            setState(entry.personId, { status: 'saved', card: result.card })
          } else if (result.error === 'duplicate') {
            setState(entry.personId, { status: 'duplicate', card: entry.card, holder: result.holder ?? null })
          } else {
            setState(entry.personId, { status: 'error', card: entry.card, error: result.error })
          }
        }
        changed()
        pump()
      },
      () => {
        // The request itself failed: nothing in this batch is known to be
        // written. Put each entry back unless a newer edit replaced it, and
        // try again after a backoff.
        for (const entry of batch) {
          inFlight.delete(entry.personId)
          if (!pending.has(entry.personId)) {
            pending.set(entry.personId, entry)
            setState(entry.personId, { status: 'retrying', card: entry.card })
          }
        }
        const delay = retryDelays[Math.min(failures, retryDelays.length - 1)]
        failures++
        retryTimer = setTimer(() => {
          retryTimer = null
          pump()
        }, delay)
        changed()
      },
    )
  }

  function sendNow() {
    if (retryTimer !== null) {
      clearTimer(retryTimer)
      retryTimer = null
    }
    pump()
  }

  function enqueue(entry: RfidEntry) {
    pending.set(entry.personId, entry)
    lastEntry.set(entry.personId, entry)
    setState(entry.personId, { status: 'queued', card: entry.card })
    changed()
    pump()
  }

  return {
    enqueue,
    retry(personId) {
      const s = states.get(personId)
      if (!s) return
      if (s.status === 'retrying') return sendNow()
      if (s.status !== 'duplicate' && s.status !== 'error') return
      const entry = lastEntry.get(personId)
      if (entry) enqueue(entry)
    },
    retryAll() {
      for (const [id, s] of states) {
        if (s.status === 'duplicate' || s.status === 'error') {
          const entry = lastEntry.get(id)
          if (entry) {
            pending.set(id, entry)
            setState(id, { status: 'queued', card: entry.card })
          }
        }
      }
      changed()
      sendNow()
    },
    state: (personId) => states.get(personId),
    pendingCount: () => pending.size + inFlight.size,
    failedCount: () => [...states.values()].filter(isFailedState).length,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    version: () => ver,
    snapshot: () => snap,
  }
}
