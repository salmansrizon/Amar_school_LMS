import { t, formatDateTime, type Lang } from '@/lib/i18n'

/** "Machine not synced" warning (#694). Rendered only by callers that found a
 *  "no record" working day later than the Attendance Agent's last heartbeat
 *  (agentNotSyncedFor in lib/school/attendance-agent-sync.ts). */
export function AgentSyncWarning({ lastHeartbeat, lang }: { lastHeartbeat: string; lang: Lang }) {
  return (
    <p role="status" className="mb-4 rounded-xl border border-line bg-sun-soft px-4 py-3 text-sm text-ink">
      {t('attendance.agentNotSynced', lang)} {t('machine.agentLastSync', lang)}: {formatDateTime(lastHeartbeat, lang)}
    </p>
  )
}
