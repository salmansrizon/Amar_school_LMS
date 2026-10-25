'use client'

import { useEffect, useRef, useState } from 'react'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { isFinished, testConnectionSummary, type MachineCommandStatus } from '@/lib/attendance-agent-store'
import { commandStatusAction, testConnectionAction } from './actions'

// Test Connection (Machine Attendance Phase 6; Baseline §16): queues a
// TEST_CONNECTION machine command; the School's Attendance Agent runs it on the
// LAN through the device's driver and reports back. The browser never connects
// to the device — it only polls the command row.

const POLL_MS = 2000
const MAX_POLLS = 60

const ERROR_KEYS: Record<string, MessageKey> = {
  errNoAgent: 'machine.testErrNoAgent',
  errNotInService: 'machine.testErrNotInService',
  errNotFound: 'machine.errNotFound',
}

export function TestConnection({ machineId, latest, lang }: { machineId: string; latest: MachineCommandStatus | null; lang: Lang }) {
  const [command, setCommand] = useState<MachineCommandStatus | null>(latest)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const polls = useRef(0)

  useEffect(() => {
    if (!command || isFinished(command.status) || polls.current >= MAX_POLLS) return
    const timer = setTimeout(async () => {
      polls.current += 1
      const next = await commandStatusAction(command.id)
      if (next) setCommand(next)
    }, POLL_MS)
    return () => clearTimeout(timer)
  }, [command])

  async function start() {
    setBusy(true)
    setError(null)
    const result = await testConnectionAction(machineId)
    setBusy(false)
    if ('error' in result) {
      setError(t(ERROR_KEYS[result.error] ?? 'machine.errSave', lang))
      return
    }
    polls.current = 0
    setCommand(await commandStatusAction(result.commandId))
  }

  const summary = testConnectionSummary(command?.result ?? null)
  const waiting = command && !isFinished(command.status)
  return (
    <div className="text-xs">
      <button
        type="button"
        disabled={busy || !!waiting}
        onClick={start}
        className="cursor-pointer rounded-full px-3 py-1 font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
      >
        {t('machine.testConnection', lang)}
      </button>
      {error && <p role="alert" className="mt-1 font-semibold text-alert-deep">{error}</p>}
      {command && (
        <p className="mt-1 text-muted" data-testid="test-connection-status">
          {waiting && t('machine.testWaiting', lang)}
          {command.status === 'succeeded' && (
            <span className="text-ink">
              {t('machine.testOk', lang)}
              {summary.serialNumber && ` · ${summary.serialNumber}`}
              {summary.serialCheck === 'serial_mismatch' && ` · ${t('machine.testSerialMismatch', lang)}`}
              {summary.elapsedMs !== null && ` · ${summary.elapsedMs} ms`}
            </span>
          )}
          {command.status === 'failed' && (
            <span className="text-alert-deep">
              {t('machine.testFailed', lang)}: {command.error_class ?? '—'}
            </span>
          )}
          {(command.status === 'cancelled' || command.status === 'expired') && t('machine.testCancelled', lang)}
        </p>
      )}
    </div>
  )
}
