'use client'

import { useRef, useState, useSyncExternalStore } from 'react'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { nextRfidFocusIndex, parseRfid, RFID_MAX_LENGTH } from '@/lib/machine-attendance'
import type { EnrollmentKind } from '@/lib/machine-enrollment-store'
import { EMPTY_RFID_SNAPSHOT, type RfidRowState } from '@/lib/rfid-save-queue'
import { rfidQueue } from './rfid-queue-client'

// Fast RFID entry (issue #675). An operator scans card after card: Enter
// saves the row in the background and moves straight to the next row that
// has no card yet. Saving never blocks typing — the shared queue
// (rfid-queue-client.ts) owns persistence, retries and ordering; this table
// only shows its state.
//
// Inputs are uncontrolled on purpose: a scanner "types" a dozen characters in
// a few milliseconds, and re-rendering hundreds of rows per keystroke would
// make the page fall behind it. The table re-renders only when the queue
// changes.
//
// Render reads come only from the queue's immutable snapshot; live queue
// methods are used only inside event handlers. The app builds with the React
// Compiler, which memoizes on input identity — reading the (never-replaced)
// queue object during render froze the save summary on "All changes saved"
// while writes were still in flight.

export interface RfidRow {
  id: string
  name: string
  /** Extra columns between name and Machine ID (class, category, shift…). */
  cells: string[]
  uniqueId: number | null
  /** The card currently stored, from machine_enroll_infos. */
  card: string | null
}

const subscribe = (listener: () => void) => rfidQueue().subscribe(listener)
const snapshot = () => rfidQueue().snapshot()
const serverSnapshot = () => EMPTY_RFID_SNAPSHOT

const ERROR_KEY: Record<string, MessageKey> = {
  invalid: 'rfid.invalid',
  notFound: 'rfid.notFound',
}

function isFailed(state: RfidRowState | undefined): boolean {
  return state?.status === 'error' || state?.status === 'duplicate'
}

export function RfidEntryTable({
  kind,
  rows,
  headers,
  lang,
}: {
  kind: EnrollmentKind
  rows: RfidRow[]
  /** Labels for `cells`, in the same order. */
  headers: string[]
  lang: Lang
}) {
  const snap = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set())

  // The value last sent or confirmed for a row: the queue's, once this
  // session has touched the row, otherwise what the server rendered. Live —
  // for event handlers only.
  const liveCommitted = (row: RfidRow): string | null => {
    const s = rfidQueue().state(row.id)
    return s ? s.card : row.card
  }

  const markInvalid = (id: string, on: boolean) =>
    setInvalid((prev) => {
      if (prev.has(id) === on) return prev
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  /** Queue the row's input if it changed (or failed before). Returns false
   *  when the value is not a valid card, so Enter stays on that row. */
  function commit(index: number): boolean {
    const row = rows[index]
    const input = inputs.current[index]
    if (!row || !input) return true
    const queue = rfidQueue()
    const parsed = parseRfid(input.value)
    if (!parsed.ok) {
      markInvalid(row.id, true)
      return false
    }
    markInvalid(row.id, false)
    input.value = parsed.value ?? ''
    if (parsed.value !== liveCommitted(row) || isFailed(queue.state(row.id))) {
      queue.enqueue({ kind, personId: row.id, card: parsed.value })
    }
    return true
  }

  function onKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      const row = rows[index]
      event.currentTarget.value = liveCommitted(row) ?? ''
      markInvalid(row.id, false)
      return
    }
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (!commit(index)) return
    // Bounded to the rows on screen, so focus never jumps to a stale input.
    const values = inputs.current.slice(0, rows.length).map((el) => el?.value.trim() || null)
    const next = nextRfidFocusIndex(values, index)
    if (next >= 0) inputs.current[next]?.focus()
  }

  const pending = snap.pendingCount
  const failed = snap.failedCount
  const withCard = rows.filter((row) => {
    const s = snap.states.get(row.id)
    return s ? s.card : row.card
  }).length

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted">
          {withCard} / {rows.length} {t('rfid.withCard', lang)}
        </span>
        <span role="status" aria-live="polite" className="flex items-center gap-2">
          {pending > 0 && (
            <span className="rounded-full bg-sky-soft px-2 py-0.5 font-semibold text-sky-deep">
              {pending} {t('rfid.pendingCount', lang)}
            </span>
          )}
          {failed > 0 && (
            <>
              <span className="rounded-full bg-alert-soft px-2 py-0.5 font-semibold text-alert-deep">
                {failed} {t('rfid.failedCount', lang)}
              </span>
              <button
                type="button"
                onClick={() => rfidQueue().retryAll()}
                className="cursor-pointer rounded-full border border-line px-2 py-0.5 font-semibold hover:bg-paper-muted"
              >
                {t('rfid.retryAll', lang)}
              </button>
            </>
          )}
          {pending === 0 && failed === 0 && (
            <span className="text-mint-deep">{t('rfid.allSaved', lang)}</span>
          )}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full text-sm">
          <thead className="bg-paper-muted text-left text-xs font-semibold text-muted">
            <tr>
              <th className="w-10 px-3 py-2">#</th>
              <th className="px-3 py-2">{t('rfid.name', lang)}</th>
              {headers.map((h) => (
                <th key={h} className="px-3 py-2">
                  {h}
                </th>
              ))}
              <th className="px-3 py-2">{t('students.uniqueId', lang)}</th>
              <th className="px-3 py-2">{t('rfid.card', lang)}</th>
              <th className="px-3 py-2">{t('rfid.status', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const state = snap.states.get(row.id)
              const bad = invalid.has(row.id) || isFailed(state)
              return (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-3 py-1.5 text-xs text-muted">{index + 1}</td>
                  <td className="px-3 py-1.5 font-semibold">{row.name}</td>
                  {row.cells.map((c, i) => (
                    <td key={i} className="px-3 py-1.5 text-muted">
                      {c || '—'}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 font-mono text-xs">{row.uniqueId ?? '—'}</td>
                  <td className="px-3 py-1">
                    <input
                      ref={(el) => {
                        inputs.current[index] = el
                      }}
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={RFID_MAX_LENGTH}
                      defaultValue={(state && state.status !== 'saved' ? state.card : row.card) ?? ''}
                      aria-label={`${t('rfid.card', lang)} — ${row.name}`}
                      aria-invalid={bad || undefined}
                      onKeyDown={(e) => onKeyDown(index, e)}
                      onBlur={() => commit(index)}
                      onFocus={(e) => e.currentTarget.select()}
                      className={`h-8 w-44 rounded-md border bg-paper px-2 font-mono text-sm outline-none focus:ring-2 focus:ring-brand-300 ${
                        bad ? 'border-alert-deep' : 'border-line'
                      }`}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    <RowStatus
                      state={state}
                      invalid={invalid.has(row.id)}
                      lang={lang}
                      onRetry={() => rfidQueue().retry(row.id)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RowStatus({
  state,
  invalid,
  lang,
  onRetry,
}: {
  state: RfidRowState | undefined
  invalid: boolean
  lang: Lang
  onRetry: () => void
}) {
  if (invalid) return <span className="font-semibold text-alert-deep">{t('rfid.invalid', lang)}</span>
  if (!state) return null
  const retry = (
    <button type="button" onClick={onRetry} className="ml-2 cursor-pointer font-semibold text-brand-600 underline">
      {t('rfid.retry', lang)}
    </button>
  )
  switch (state.status) {
    case 'queued':
      return <span className="text-muted">{t('rfid.queued', lang)}</span>
    case 'saving':
      return <span className="text-sky-deep">{t('rfid.saving', lang)}…</span>
    case 'retrying':
      return (
        <span className="text-sun-deep">
          {t('rfid.retrying', lang)}
          {retry}
        </span>
      )
    case 'saved':
      return <span className="text-mint-deep">✓ {t('rfid.saved', lang)}</span>
    case 'duplicate':
      return (
        <span className="text-alert-deep">
          <span className="font-semibold">{t('rfid.duplicate', lang)}</span>
          {state.holder ? ` — ${t('rfid.duplicateBy', lang)} ${state.holder}` : ''}
          {retry}
        </span>
      )
    case 'error':
      return (
        <span className="text-alert-deep">
          <span className="font-semibold">{t(ERROR_KEY[state.error ?? ''] ?? 'rfid.error', lang)}</span>
          {retry}
        </span>
      )
  }
}
