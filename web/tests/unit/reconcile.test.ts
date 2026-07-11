import { describe, it, expect } from 'vitest'
import { collapseTaps, employeeStatus, resolveEmployeeDisplayStatus } from '@/lib/attendance'

// Mirrors the SQL reconciliation rules (issue #10, CONTEXT/PRD §5.3):
// earliest tap = entry, latest tap = exit, everything between is noise.
describe('collapseTaps', () => {
  const at = (time: string) => new Date(`2026-07-08T${time}:00Z`)

  it('4+ taps collapse to earliest entry / latest exit', () => {
    const result = collapseTaps([at('12:05'), at('07:58'), at('09:30'), at('14:01')])
    expect(result).toEqual({ entry: at('07:58'), exit: at('14:01') })
  })

  it('a single tap is entry with no exit', () => {
    expect(collapseTaps([at('08:00')])).toEqual({ entry: at('08:00'), exit: null })
  })

  it('no taps → null', () => {
    expect(collapseTaps([])).toBeNull()
  })
})

describe('employeeStatus: applies shift window + Considerable Grace', () => {
  const at = (time: string) => new Date(`2026-07-08T${time}:00Z`)

  it('entry within start+grace is on time', () => {
    expect(employeeStatus(at('08:20'), at('13:55'), '08:00', '14:00', 25)).toBe('exit_early')
    expect(employeeStatus(at('08:20'), at('14:00'), '08:00', '14:00', 25)).toBe('on_time')
  })

  it('entry after start+grace is late', () => {
    expect(employeeStatus(at('08:26'), at('14:05'), '08:00', '14:00', 25)).toBe('late_entry')
  })

  it('exit before end is early exit', () => {
    expect(employeeStatus(at('08:00'), at('13:30'), '08:00', '14:00', 0)).toBe('exit_early')
  })

  it('late entry and early exit combine', () => {
    expect(employeeStatus(at('09:00'), at('12:00'), '08:00', '14:00', 15)).toBe('late_exit_early')
  })

  it('no shift window configured → plain present', () => {
    expect(employeeStatus(at('08:00'), at('14:00'), null, null, 30)).toBe('present')
  })
})

// Employee 6-state status codes (issue #30, PRD §5.3): the 4 combos above
// plus the two outer states the reconciliation job never writes.
describe('resolveEmployeeDisplayStatus: adds absent/on_leave around employeeStatus', () => {
  const at = (time: string) => new Date(`2026-07-08T${time}:00Z`)

  it('no record, no leave -> absent', () => {
    expect(
      resolveEmployeeDisplayStatus({
        hasRecord: false,
        onApprovedLeave: false,
        entry: null,
        exit: null,
        shiftStart: '08:00',
        shiftEnd: '14:00',
        graceMinutes: 10,
      }),
    ).toBe('absent')
  })

  it('no record, on approved leave -> on_leave (not absent)', () => {
    expect(
      resolveEmployeeDisplayStatus({
        hasRecord: false,
        onApprovedLeave: true,
        entry: null,
        exit: null,
        shiftStart: '08:00',
        shiftEnd: '14:00',
        graceMinutes: 10,
      }),
    ).toBe('on_leave')
  })

  it('a record present delegates to employeeStatus', () => {
    expect(
      resolveEmployeeDisplayStatus({
        hasRecord: true,
        onApprovedLeave: false,
        entry: at('08:05'),
        exit: at('16:32'),
        shiftStart: '08:00',
        shiftEnd: '16:00',
        graceMinutes: 10,
      }),
    ).toBe('on_time')
  })
})
