import { describe, it, expect } from 'vitest'
import {
  activeMachines,
  filterEmployeesByShift,
  machineShiftChoice,
  nextRfidFocusIndex,
  NO_SHIFT_FILTER,
  parseMachineInput,
  parseRfid,
  RFID_MAX_LENGTH,
} from '@/lib/machine-attendance'

// Machine Attendance domain rules (issue #675).

const base = {
  machine_type: 'zkteco',
  model: ' K40 ',
  serial_number: ' SN-001 ',
  location: ' Main Gate ',
  shift: '',
  note: '',
}

describe('parseMachineInput', () => {
  it('accepts a complete machine and trims every field', () => {
    expect(parseMachineInput(base, ['Morning', 'Day'])).toEqual({
      machine_type: 'zkteco',
      model: 'K40',
      serial_number: 'SN-001',
      location: 'Main Gate',
      shift_scope: 'none',
      shift: null,
      note: null,
      host: null,
      port: 4370,
    })
  })

  it('keeps a trimmed LAN address and an explicit port', () => {
    const r = parseMachineInput({ ...base, host: ' 192.168.0.201 ', port: ' 5005 ' }, [])
    expect('error' in r ? r : { host: r.host, port: r.port }).toEqual({ host: '192.168.0.201', port: 5005 })
  })

  it("defaults an empty port to the vendor's port (ZKTeco 4370, Timmy 5005)", () => {
    const zk = parseMachineInput({ ...base, host: '10.0.0.5', port: '' }, [])
    const timmy = parseMachineInput({ ...base, machine_type: 'timmy', port: '  ' }, [])
    expect('error' in zk ? zk : zk.port).toBe(4370)
    expect('error' in timmy ? timmy : timmy.port).toBe(5005)
  })

  it('refuses a malformed address or an out-of-range port', () => {
    expect(parseMachineInput({ ...base, host: '192.168.0.1 /24' }, [])).toEqual({ error: 'errHost' })
    expect(parseMachineInput({ ...base, host: 'http://dev' }, [])).toEqual({ error: 'errHost' })
    expect(parseMachineInput({ ...base, port: '0' }, [])).toEqual({ error: 'errPort' })
    expect(parseMachineInput({ ...base, port: '65536' }, [])).toEqual({ error: 'errPort' })
    expect(parseMachineInput({ ...base, port: '43a0' }, [])).toEqual({ error: 'errPort' })
  })

  it('keeps a note, trimmed', () => {
    const r = parseMachineInput({ ...base, note: '  Main entrance machine.  ' }, [])
    expect('error' in r ? null : r.note).toBe('Main entrance machine.')
  })

  it('refuses an unknown machine type and missing required fields', () => {
    expect(parseMachineInput({ ...base, machine_type: 'acme' }, [])).toEqual({ error: 'errMachineType' })
    expect(parseMachineInput({ ...base, model: '  ' }, [])).toEqual({ error: 'errModel' })
    expect(parseMachineInput({ ...base, serial_number: '' }, [])).toEqual({ error: 'errSerial' })
    expect(parseMachineInput({ ...base, location: '' }, [])).toEqual({ error: 'errLocation' })
  })

  it('dedicates a machine to one configured shift', () => {
    const r = parseMachineInput({ ...base, shift: 'Morning' }, ['Morning', 'Day'])
    expect('error' in r ? r : { scope: r.shift_scope, shift: r.shift }).toEqual({ scope: 'shift', shift: 'Morning' })
  })

  it('dedicates a machine to all shifts', () => {
    const r = parseMachineInput({ ...base, shift: 'all' }, ['Morning', 'Day'])
    expect('error' in r ? r : { scope: r.shift_scope, shift: r.shift }).toEqual({ scope: 'all', shift: null })
  })

  it('refuses a shift the school does not run', () => {
    expect(parseMachineInput({ ...base, shift: 'Night' }, ['Morning', 'Day'])).toEqual({ error: 'errShift' })
    expect(parseMachineInput({ ...base, shift: 'Afternoon' }, ['Morning'])).toEqual({ error: 'errShift' })
  })

  it('gives a school with no shifts only "no shift" — never a pretend shift', () => {
    expect(parseMachineInput({ ...base, shift: 'all' }, [])).toEqual({ error: 'errShift' })
    expect(parseMachineInput({ ...base, shift: 'Morning' }, [])).toEqual({ error: 'errShift' })
    const r = parseMachineInput(base, [])
    expect('error' in r ? r : r.shift_scope).toBe('none')
  })
})

describe('machineShiftChoice', () => {
  it('maps a stored machine back to its form value', () => {
    expect(machineShiftChoice({ shift_scope: 'none', shift: null })).toBe('')
    expect(machineShiftChoice({ shift_scope: 'all', shift: null })).toBe('all')
    expect(machineShiftChoice({ shift_scope: 'shift', shift: 'Day' })).toBe('Day')
  })
})

describe('parseRfid', () => {
  it('keeps leading zeros — a card number is a string, never a number', () => {
    expect(parseRfid('00012345')).toEqual({ ok: true, value: '00012345' })
    expect(parseRfid('0000')).toEqual({ ok: true, value: '0000' })
  })

  it('strips the newline or tab a reader appends', () => {
    expect(parseRfid(' 0124442235533\r\n')).toEqual({ ok: true, value: '0124442235533' })
  })

  it('treats empty as "no card"', () => {
    expect(parseRfid('')).toEqual({ ok: true, value: null })
    expect(parseRfid('   ')).toEqual({ ok: true, value: null })
  })

  it('refuses two scans run together and runaway input', () => {
    expect(parseRfid('0001 0002')).toEqual({ ok: false, error: 'errRfidInvalid' })
    expect(parseRfid('9'.repeat(RFID_MAX_LENGTH + 1))).toEqual({ ok: false, error: 'errRfidInvalid' })
    expect(parseRfid('9'.repeat(RFID_MAX_LENGTH))).toEqual({ ok: true, value: '9'.repeat(RFID_MAX_LENGTH) })
  })
})

describe('nextRfidFocusIndex', () => {
  it('moves to the next row without a card, skipping rows that have one', () => {
    expect(nextRfidFocusIndex(['A', 'B', null, null], 0)).toBe(2)
  })

  it('falls back to the very next row when every later row has a card', () => {
    expect(nextRfidFocusIndex(['A', 'B', 'C'], 0)).toBe(1)
  })

  it('stops at the end of the list', () => {
    expect(nextRfidFocusIndex(['A', null], 1)).toBe(-1)
  })

  it('walks a fresh list row by row', () => {
    const values: (string | null)[] = [null, null, null]
    values[0] = 'X'
    expect(nextRfidFocusIndex(values, 0)).toBe(1)
    values[1] = 'Y'
    expect(nextRfidFocusIndex(values, 1)).toBe(2)
  })
})

describe('filterEmployeesByShift', () => {
  const employees = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const shifts = new Map([
    ['a', ['Morning']],
    ['b', ['Morning', 'Day']],
  ])

  it('keeps everyone with no filter', () => {
    expect(filterEmployeesByShift(employees, shifts, '').map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('keeps employees who work the shift, including multi-shift employees', () => {
    expect(filterEmployeesByShift(employees, shifts, 'Morning').map((e) => e.id)).toEqual(['a', 'b'])
    expect(filterEmployeesByShift(employees, shifts, 'Day').map((e) => e.id)).toEqual(['b'])
  })

  it('finds employees with no shift assigned', () => {
    expect(filterEmployeesByShift(employees, shifts, NO_SHIFT_FILTER).map((e) => e.id)).toEqual(['c'])
  })
})

describe('activeMachines', () => {
  it('keeps machines in service and leaves archived ones out', () => {
    const machines = [
      { id: 'a', archived_at: null },
      { id: 'b', archived_at: '2026-10-17T00:00:00Z' },
      { id: 'c', archived_at: null },
    ]
    expect(activeMachines(machines).map((m) => m.id)).toEqual(['a', 'c'])
  })
})
