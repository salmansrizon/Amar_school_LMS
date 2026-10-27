import { Pager, paginate, pageSizeFrom } from '@/components/pager'
import Form from 'next/form'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { requireEmployeeAttendanceAdmin } from '@/lib/school/employee-attendance-admin'
import { schoolRoster } from '@/lib/school/roster-source'
import { classSectionLabel } from '@/lib/students'
import { enrollmentInfo, listMachines } from '@/lib/machine-enrollment-store'
import { activeMachines, type AttendanceMachine } from '@/lib/machine-attendance'
import { listAgents } from '@/lib/attendance-agent-store'
import {
  openEpisodes,
  planProvisioning,
  provisionStatus,
  toProvisionEpisode,
  type EpisodeRow,
  type ProvisionCapabilities,
  type ProvisionCommand,
  type ProvisionPerson,
} from '@/lib/attendance-provisioning'
import { ClassSectionSelect } from '@/components/ui/class-section-select'
import { AttendanceTabs } from '../../attendance-tabs'
import { MachinePageHeader } from '../page-header'
import { ProvisionButton } from '../provision-button'
import { RfidEntryTable, type DeviceBadge, type RfidRow } from '../rfid-entry-table'
import { filterButtonClass, inputClass } from '@/components/ui/field'

// Student RFID Enrollment (issue #675). The roster is the same one Mark
// Attendance uses: the global Academic Year Selection narrows the students,
// the global Shift Selection narrows the class picker (the existing #579
// convention, kept on purpose), and this page adds its own Class filter and
// name search. Machine IDs are students.unique_id; cards come from
// machine_enroll_infos.

/** Per student, one badge per machine the student is on (an open episode) — or a single "not on machine". */
function deviceBadges(
  machines: AttendanceMachine[],
  activeAgentIds: ReadonlySet<string>,
  open: { episodes: EpisodeRow[]; commands: Map<string, ProvisionCommand> },
  lang: Lang,
): (personId: string, person: ProvisionPerson) => DeviceBadge[] {
  return (personId, person) => {
    const badges: DeviceBadge[] = []
    for (const m of machines) {
      const row = open.episodes.find((e) => e.machine_id === m.id && e.student_id === personId)
      if (!row) continue
      const episode = toProvisionEpisode(row, personId)
      const plan = planProvisioning(
        person,
        {
          inService: m.enabled && m.archived_at === null,
          hasActiveAgent: !!m.agent_id && activeAgentIds.has(m.agent_id),
          capabilities: (m.capabilities as ProvisionCapabilities | null) ?? null,
        },
        episode,
        row.last_command_id ? (open.commands.get(row.last_command_id) ?? null) : null,
      )
      const status = provisionStatus(plan, episode, row.last_error)
      const label = m.location || m.serial_number
      if (status.state === 'blocked') badges.push({ machine: label, text: t(`provision.${status.reason}` as MessageKey, lang), tone: 'bad' })
      else if (status.state === 'failed') badges.push({ machine: label, text: t('provision.state.failed', lang), tone: 'bad', title: status.error ?? undefined })
      else if (status.state === 'synced') badges.push({ machine: label, text: t('provision.state.synced', lang), tone: 'ok' })
      else badges.push({ machine: label, text: t(`provision.state.${status.state}` as MessageKey, lang), tone: status.state === 'notEnrolled' ? 'muted' : 'wait' })
    }
    return badges.length ? badges : [{ machine: '—', text: t('provision.state.notEnrolled', lang), tone: 'muted' }]
  }
}

export default async function StudentRfidPage({
  searchParams,
}: {
  searchParams: Promise<{ classSection?: string; q?: string; page?: string; size?: string }>
}) {
  const params = await searchParams
  const { classSection = '', q = '' } = params
  const lang: Lang = await currentLang()
  const { supabase, shiftSelection, startedAcademicYears, academicYearSelection } = await getSchoolContext()
  // #677: Owner and office staff only; a teacher is refused.
  await requireEmployeeAttendanceAdmin('/school/attendance/machine/students')

  const [view, machines, agents] = await Promise.all([
    schoolRoster(supabase, {
      classSection,
      q,
      shiftSelection,
      showYear: startedAcademicYears.length > 1,
      academicYearSelection,
    }),
    listMachines(supabase),
    listAgents(supabase),
  ])
  // The roster is already loaded for the filter; only the page's students need
  // their card lookup and device status.
  const pageSize = pageSizeFrom(params.size, 20)
  const pageData = paginate(view.students, params.page, pageSize)
  const pageIds = pageData.items.map((s) => s.id)
  const [info, open] = await Promise.all([enrollmentInfo(supabase, 'student', pageIds), openEpisodes(supabase, 'student', pageIds)])
  const inService = activeMachines(machines)
  const devices = deviceBadges(inService, new Set(agents.filter((a) => a.status === 'active').map((a) => a.id)), open, lang)
  const rows: RfidRow[] = pageData.items.map((s) => {
    const person: ProvisionPerson = {
      kind: 'student',
      archived: false, // the roster lists current students only
      uniqueId: info.get(s.id)?.uniqueId ?? null,
      fullName: s.full_name,
      hasEnrollRow: (info.get(s.id)?.card ?? null) !== null, // a student's enrollment row exists only to carry a card
      card: info.get(s.id)?.card ?? null,
    }
    return {
      id: s.id,
      name: s.full_name,
      cells: [classSectionLabel(s.class_name, s.section) ?? '', s.roll_number == null ? '' : String(s.roll_number)],
      uniqueId: person.uniqueId,
      card: person.card,
      devices: devices(s.id, person),
    }
  })

  return (
    <div>
      <MachinePageHeader title={t('attendance.tabStudentRfid', lang)} lang={lang} />
      <AttendanceTabs active="/school/attendance/machine/students" lang={lang} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">{t('rfid.intro', lang)}</p>
        <ProvisionButton kind="student" machines={inService} personIds={view.students.map((s) => s.id)} lang={lang} />
      </div>

      <Form
        action="/school/attendance/machine/students"
        className="mb-4 grid gap-3 rounded-lg border border-line bg-paper p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">{t('attendance.classSection', lang)}</label>
          <ClassSectionSelect
            combos={view.combos}
            value={classSection}
            ariaLabel={t('attendance.classSection', lang)}
            allLabel={t('attendance.allClasses', lang)}
            fullWidth
          />
        </div>
        <div>
          <label htmlFor="q" className="mb-1 block text-xs font-semibold text-muted">
            {t('rfid.name', lang)}
          </label>
          <input id="q" name="q" type="search" defaultValue={q} className={inputClass({ fullWidth: true })} />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className={filterButtonClass({ fullWidth: true })}
          >
            {t('classes.filter', lang)}
          </button>
        </div>
      </Form>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-paper p-6 text-center text-sm text-muted">
          {t('rfid.noStudents', lang)}
        </div>
      ) : (
        <RfidEntryTable
          // A new filter is a new list: start its inputs fresh.
          key={`${classSection}|${q}|${pageData.page}|${pageSize}`}
          kind="student"
          rows={rows}
          headers={[t('rfid.class', lang), t('students.roll', lang)]}
          lang={lang}
          devicesHeader={inService.length ? t('provision.devices', lang) : undefined}
        />
      )}
      {view.students.length > 0 && (
        <Pager page={pageData.page} totalPages={pageData.totalPages} total={pageData.total} lang={lang} params={params} pageSize={pageSize} />
      )}
    </div>
  )
}
