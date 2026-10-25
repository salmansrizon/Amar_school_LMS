'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, formatDateTime, type Lang } from '@/lib/i18n'
import type { AttendanceAgent } from '@/lib/attendance-agent-store'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { createActivationCodeAction, revokeAgentAction } from './actions'

// Attendance Agents (Machine Attendance Phase 6; ADR 0033). The School
// generates a one-time activation code here and enters it in the Agent's local
// configuration tool on the School PC. The code is shown once; only its hash
// is stored. No Agent credential or device key is ever shown or stored here.

const buttonClass =
  'cursor-pointer rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'

export function AgentPanel({ agents, lang }: { agents: AttendanceAgent[]; lang: Lang }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function generate() {
    startTransition(async () => {
      const result = await createActivationCodeAction()
      if ('error' in result) {
        setError(t('machine.errSave', lang))
        return
      }
      setError(null)
      setCode(result)
    })
  }

  return (
    <section className="grid gap-3 rounded-lg border border-line bg-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">{t('machine.agentsTitle', lang)}</h2>
          <p className="max-w-2xl text-sm text-muted">{t('machine.agentsIntro', lang)}</p>
        </div>
        <button type="button" disabled={pending} onClick={generate} className={buttonClass}>
          {t('machine.agentCodeGenerate', lang)}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-alert-deep">
          {error}
        </p>
      )}
      {code && (
        <div className="rounded-md border border-brand-200 bg-brand-50 p-3">
          <p className="text-sm">{t('machine.agentCodeShownOnce', lang)}</p>
          <p className="my-2 font-mono text-2xl font-bold tracking-widest" data-testid="activation-code">
            {code.code}
          </p>
          <p className="text-xs text-muted">
            {t('machine.agentCodeExpires', lang)}: {formatDateTime(code.expiresAt, lang)}
          </p>
        </div>
      )}
      {agents.length === 0 ? (
        <p className="text-sm text-muted">{t('machine.agentsNone', lang)}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold text-muted">
              <tr>
                <th className="px-2 py-1">{t('machine.agentName', lang)}</th>
                <th className="px-2 py-1">{t('machine.agentStatus', lang)}</th>
                <th className="px-2 py-1">{t('machine.agentLastSync', lang)}</th>
                <th className="px-2 py-1">{t('machine.agentVersion', lang)}</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <td className="px-2 py-1 font-semibold">{a.hostname ?? a.name}</td>
                  <td className="px-2 py-1">{t(a.status === 'active' ? 'machine.agentActive' : 'machine.agentRevoked', lang)}</td>
                  <td className="px-2 py-1">{a.last_heartbeat_at ? formatDateTime(a.last_heartbeat_at, lang) : '—'}</td>
                  <td className="px-2 py-1 font-mono text-xs">{a.agent_version ?? '—'}</td>
                  <td className="px-2 py-1 text-right">
                    {a.status === 'active' && (
                      <ConfirmDialog
                        triggerLabel={t('machine.agentRevoke', lang)}
                        triggerClassName="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft"
                        title={t('machine.agentRevokeTitle', lang)}
                        body={t('machine.agentRevokeBody', lang)}
                        confirmLabel={t('machine.agentRevoke', lang)}
                        cancelLabel={t('machine.cancel', lang)}
                        onConfirm={async () => {
                          const result = await revokeAgentAction(a.id)
                          if (result.error) return { error: t('machine.errSave', lang) }
                          router.refresh()
                        }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
