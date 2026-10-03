import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { isKnownAcademicShift } from '@/lib/institute'
import { listMachines } from '@/lib/machine-enrollment-store'
import { AttendanceTabs } from '../attendance-tabs'
import { MachinePageHeader } from './page-header'
import { MachineSetup } from './machine-setup'
import { DownloadServiceButton } from './machine-ui'

// Machine Setup (issue #675): the attendance machines installed at this
// School. Configuration only — the future Windows sync service will read it.

export default async function MachineSetupPage() {
  const lang: Lang = await currentLang()
  const { supabase, configuredShifts } = await getSchoolContext()
  const machines = await listMachines(supabase)

  return (
    <div>
      <MachinePageHeader title={t('machine.setupTitle', lang)} lang={lang} />
      <AttendanceTabs active="/school/attendance/machine" lang={lang} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">{t('machine.setupIntro', lang)}</p>
        <DownloadServiceButton lang={lang} />
      </div>
      <MachineSetup machines={machines} configuredShifts={configuredShifts.filter(isKnownAcademicShift)} lang={lang} />
    </div>
  )
}
