import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  EnrollButton,
  MachineIdentity,
  MachinePickList,
  UpcomingNotice,
  machineShiftLabel,
} from '@/app/school/attendance/machine/machine-ui'
import { RfidEntryTable } from '@/app/school/attendance/machine/rfid-entry-table'
import type { AttendanceMachine } from '@/lib/machine-attendance'

// MachineSetup calls useRouter() for router.refresh() after a save.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))

// Machine Attendance markup (issue #675): the machine picker makes the
// physical machine unmistakable, the placeholders say Upcoming and call
// nothing, and the RFID table renders cards as text.

const k40: AttendanceMachine = {
  id: 'm1',
  machine_type: 'zkteco',
  model: 'K40',
  serial_number: 'SN-4471',
  location: 'Main Gate',
  shift_scope: 'shift',
  shift: 'Morning',
  note: null,
}
const timmy: AttendanceMachine = {
  ...k40,
  id: 'm2',
  machine_type: 'timmy',
  model: 'T200',
  serial_number: 'TM-9',
  location: 'Back Gate',
  shift_scope: 'all',
  shift: null,
}

describe('machine identity', () => {
  it('shows model, vendor, serial, location and a highlighted shift', () => {
    const html = renderToStaticMarkup(<MachineIdentity machine={k40} lang="en" />)
    expect(html).toContain('K40')
    expect(html).toContain('ZKTeco')
    expect(html).toContain('SN-4471')
    expect(html).toContain('Main Gate')
    expect(html).toMatch(/data-shift-badge[^>]*>Morning</)
  })

  it('labels all-shift and no-shift machines', () => {
    expect(machineShiftLabel(timmy, 'en')).toBe('All shifts')
    expect(machineShiftLabel({ shift_scope: 'none', shift: null }, 'en')).toBeNull()
    const html = renderToStaticMarkup(<MachineIdentity machine={{ ...k40, shift_scope: 'none', shift: null }} lang="en" />)
    expect(html).not.toContain('data-shift-badge')
  })
})

describe('machine picker', () => {
  it('offers every machine as a radio with its full identity', () => {
    const html = renderToStaticMarkup(
      <MachinePickList machines={[k40, timmy]} selectedId="m2" onSelect={() => {}} lang="en" />,
    )
    expect(html.match(/type="radio"/g)).toHaveLength(2)
    expect(html).toContain('SN-4471')
    expect(html).toContain('TM-9')
    expect(html).toContain('Back Gate')
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? []
    expect(radios.find((r) => r.includes('value="m2"'))).toContain('checked')
    expect(radios.find((r) => r.includes('value="m1"'))).not.toContain('checked')
  })

  it('says what to do when there is no machine yet', () => {
    const html = renderToStaticMarkup(<MachinePickList machines={[]} selectedId={null} onSelect={() => {}} lang="en" />)
    expect(html).toContain('add one in Machine Setup first')
  })

  it('renders the enroll buttons closed until clicked', () => {
    expect(renderToStaticMarkup(<EnrollButton kind="student" machines={[k40]} lang="en" />)).toContain('Enroll Students')
    expect(renderToStaticMarkup(<EnrollButton kind="employee" machines={[k40]} lang="en" />)).toContain('Enroll Employees')
  })
})

describe('upcoming placeholders', () => {
  it('shows an Upcoming badge with the explanation', () => {
    const html = renderToStaticMarkup(<UpcomingNotice body="Synchronization arrives later." lang="en" />)
    expect(html).toContain('Upcoming')
    expect(html).toContain('Synchronization arrives later.')
  })

  it('never calls a server action, an API or a download', () => {
    const source = readFileSync(path.join(__dirname, '../../app/school/attendance/machine/machine-ui.tsx'), 'utf8')
    expect(source).not.toMatch(/from '\.\/actions'/)
    expect(source).not.toMatch(/\bfetch\(/)
    expect(source).not.toMatch(/\bhref=/)
    expect(source).not.toMatch(/\.exe\b/)
  })
})

describe('rfid entry table', () => {
  const rows = [
    { id: 's1', name: 'Rahim', cells: ['Nine / A'], uniqueId: 1234, card: '00012345' },
    { id: 's2', name: 'Karim', cells: ['Nine / A'], uniqueId: 1235, card: null },
  ]

  it('shows the Machine ID and the stored card exactly, in a text input', () => {
    const html = renderToStaticMarkup(<RfidEntryTable kind="student" rows={rows} headers={['Class']} lang="en" />)
    expect(html).toContain('Machine ID')
    expect(html).toContain('1234')
    expect(html).toContain('value="00012345"')
    expect(html).not.toContain('type="number"')
    expect(html.match(/type="text"/g)).toHaveLength(2)
    expect(html).toContain('1 / 2')
  })
})

describe('machine setup form', () => {
  it('offers All shifts, each configured shift and No shift when the school runs shifts', async () => {
    const { MachineSetup } = await import('@/app/school/attendance/machine/machine-setup')
    const html = renderToStaticMarkup(<MachineSetup machines={[k40]} configuredShifts={['Morning', 'Day']} lang="en" />)
    const options = [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)</g)].map((m) => `${m[1]}=${m[2]}`)
    expect(options).toEqual(expect.arrayContaining(['all=All shifts', 'Morning=Morning', 'Day=Day', '=No shift']))
    expect(options).not.toContain('Evening=Evening')
    expect(html).toContain('SN-4471')
  })

  it('shows no shift choice at all for a school without shifts', async () => {
    const { MachineSetup } = await import('@/app/school/attendance/machine/machine-setup')
    const html = renderToStaticMarkup(<MachineSetup machines={[]} configuredShifts={[]} lang="en" />)
    expect(html).not.toContain('<select id="shift"')
    expect(html).toContain('<input type="hidden" name="shift" value=""/>')
    expect(html).toContain('No machines added yet')
  })
})
