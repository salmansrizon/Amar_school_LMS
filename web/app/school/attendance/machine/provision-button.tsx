'use client'

import { useState, useTransition } from 'react'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import type { AttendanceMachine } from '@/lib/machine-attendance'
import type { ProvisionKind, ProvisionResult } from '@/lib/attendance-provisioning'
import { Modal } from '@/components/modal'
import { MachineIdentity } from './machine-ui'
import { enrollPeopleAction } from './actions'

// Enroll Students (Phase 9; Baseline §14.2): choose one or more machines, send
// everyone in the current list. The server plans each (person, machine) pair
// and answers what it queued and why it skipped the rest; nothing is shown as
// queued that the machine cannot do.

const triggerClass =
  'cursor-pointer rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50'
const secondaryClass = 'cursor-pointer rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-paper-muted'

function tally(items: readonly { key: string }[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const { key } of items) counts.set(key, (counts.get(key) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

export function ProvisionButton({
  kind,
  machines,
  personIds,
  lang,
}: {
  kind: ProvisionKind
  machines: AttendanceMachine[]
  personIds: string[]
  lang: Lang
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [result, setResult] = useState<ProvisionResult | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, startTransition] = useTransition()

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const send = () =>
    startTransition(async () => {
      setFailed(false)
      const r = await enrollPeopleAction(kind, [...selected], personIds)
      if ('error' in r) setFailed(true)
      else setResult(r)
    })

  return (
    <Modal
      lang={lang}
      triggerLabel={t('machine.enrollStudents', lang)}
      triggerClassName={triggerClass}
      title={t(result ? 'provision.resultTitle' : 'provision.pickMachines', lang)}
      onOpenChange={(open) => {
        if (!open) {
          setSelected(new Set())
          setResult(null)
          setFailed(false)
        }
      }}
    >
      {(close) =>
        result ? (
          <div className="grid gap-3" data-provision-result>
            <ul className="grid gap-1 text-sm">
              {tally(result.queued.map((q) => ({ key: q.outcome }))).map(([outcome, n]) => (
                <li key={outcome} className="flex justify-between gap-4">
                  <span>{t(`provision.outcome.${outcome}` as MessageKey, lang)}</span>
                  <span className="font-semibold">{n}</span>
                </li>
              ))}
            </ul>
            {result.skipped.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-muted">{t('provision.notSent', lang)}</p>
                <ul className="grid gap-1 text-sm">
                  {tally(result.skipped.map((s) => ({ key: s.reason }))).map(([reason, n]) => (
                    <li key={reason} className="flex justify-between gap-4 text-alert-deep">
                      <span>{t(`provision.${reason}` as MessageKey, lang)}</span>
                      <span className="font-semibold">{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted">{t('provision.queuedNote', lang)}</p>
            <div className="flex justify-end">
              <button type="button" onClick={close} className={triggerClass}>
                {t('machine.close', lang)}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {machines.length === 0 ? (
              <p className="text-sm text-muted">{t('machine.pickNone', lang)}</p>
            ) : (
              <ul className="grid gap-2" aria-label={t('provision.pickMachines', lang)}>
                {machines.map((m) => (
                  <li key={m.id}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                        selected.has(m.id) ? 'border-brand-500 ring-2 ring-brand-300' : 'border-line hover:bg-paper-muted'
                      }`}
                    >
                      <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} className="mt-1" />
                      <MachineIdentity machine={m} lang={lang} />
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm text-muted">
              {personIds.length} {t('provision.scopeStudents', lang)}
            </p>
            {failed && <p className="text-sm font-semibold text-alert-deep">{t('provision.errFailed', lang)}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className={secondaryClass}>
                {t('machine.cancel', lang)}
              </button>
              <button type="button" disabled={busy || selected.size === 0 || personIds.length === 0} onClick={send} className={triggerClass}>
                {busy ? t('provision.sending', lang) : t('provision.confirm', lang)}
              </button>
            </div>
          </div>
        )
      }
    </Modal>
  )
}
