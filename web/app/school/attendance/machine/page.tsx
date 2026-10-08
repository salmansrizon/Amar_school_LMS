import { currentLang } from '@/lib/i18n-server'
import { t, formatDateTime, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { requireEmployeeAttendanceAdmin } from '@/lib/school/employee-attendance-admin'
import { isKnownAcademicShift } from '@/lib/institute'
import { listMachines } from '@/lib/machine-enrollment-store'
import { loadLastAgentHeartbeat } from '@/lib/school/attendance-agent-sync'
import { AttendanceTabs } from '../attendance-tabs'
import { MachinePageHeader } from './page-header'
import { MachineSetup } from './machine-setup'
import { DownloadServiceButton } from './machine-ui'

// Machine Setup (issue #675): the attendance machines installed at this
// School. Configuration only — the future Windows sync service will read it.

export default async function MachineSetupPage() {
  const lang: Lang = await currentLang()
  const { supabase, configuredShifts } = await getSchoolContext()
  // #677: Owner and office staff only; a teacher is refused.
  await requireEmployeeAttendanceAdmin('/school/attendance/machine')
  const [machines, lastHeartbeat] = await Promise.all([listMachines(supabase), loadLastAgentHeartbeat(supabase)])

  return (
    <div>
      <MachinePageHeader title={t('machine.setupTitle', lang)} lang={lang} />
      <AttendanceTabs active="/school/attendance/machine" lang={lang} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">{t('machine.setupIntro', lang)}</p>
        <DownloadServiceButton lang={lang} />
      </div>
      {/* #694: shown only once an Attendance Agent has sent a heartbeat (ADR 0033). */}
      {lastHeartbeat && (
        <p className="mb-4 text-sm text-muted">
          {t('machine.agentLastSync', lang)}: <span className="text-ink">{formatDateTime(lastHeartbeat, lang)}</span>
        </p>
      )}
      <MachineSetup machines={machines} configuredShifts={configuredShifts.filter(isKnownAcademicShift)} lang={lang} />
    </div>
  )
}
