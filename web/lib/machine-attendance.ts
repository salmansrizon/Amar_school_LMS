import { isKnownAcademicShift, type AcademicShift } from '@/lib/institute'

// Machine Attendance (issue #675): the framework-free rules behind Machine
// Setup and RFID enrollment. No Supabase, no React — the store
// (lib/machine-enrollment-store.ts) and the screens both build on these.

/** Machine vendors a School can register. Brand names, so they are shown as
 *  written rather than translated. Add a vendor here and in the
 *  attendance_machines.machine_type check constraint together. */
export const MACHINE_TYPES = [
  { value: 'zkteco', label: 'ZKTeco' },
  { value: 'timmy', label: 'Timmy' },
] as const

export type MachineType = (typeof MACHINE_TYPES)[number]['value']

export function isMachineType(value: string): value is MachineType {
  return MACHINE_TYPES.some((m) => m.value === value)
}

export function machineTypeLabel(value: string): string {
  return MACHINE_TYPES.find((m) => m.value === value)?.label ?? value
}

/** Which Shift a machine serves: none, every configured Shift, or one. */
export type MachineShiftScope = 'none' | 'all' | 'shift'

export interface AttendanceMachine {
  id: string
  machine_type: string
  model: string
  serial_number: string
  location: string
  shift_scope: MachineShiftScope
  shift: string | null
  note: string | null
}

export interface MachineInput {
  machine_type: MachineType
  model: string
  serial_number: string
  location: string
  shift_scope: MachineShiftScope
  shift: AcademicShift | null
  note: string | null
}

export type MachineInputError =
  | 'errMachineType'
  | 'errModel'
  | 'errSerial'
  | 'errLocation'
  | 'errShift'

/** The value a Machine Setup form submits for its Shift control: '' (none),
 *  'all', or a Shift name. One control rather than two, so "no shift" and
 *  "a shift" can never both be chosen. */
export function machineShiftChoice(machine: Pick<AttendanceMachine, 'shift_scope' | 'shift'>): string {
  if (machine.shift_scope === 'all') return 'all'
  if (machine.shift_scope === 'shift') return machine.shift ?? ''
  return ''
}

/** Validates a Machine Setup submission against the caller's own School's
 *  configured Shifts. A School with no Shifts can only save "no shift"; a
 *  Shift the School does not currently run is refused rather than stored as
 *  a row nobody can see in the picker. */
export function parseMachineInput(
  raw: {
    machine_type: string
    model: string
    serial_number: string
    location: string
    shift: string
    note: string
  },
  configuredShifts: readonly string[],
): MachineInput | { error: MachineInputError } {
  const machineType = raw.machine_type.trim()
  if (!isMachineType(machineType)) return { error: 'errMachineType' }
  const model = raw.model.trim()
  if (!model) return { error: 'errModel' }
  const serial = raw.serial_number.trim()
  if (!serial) return { error: 'errSerial' }
  const location = raw.location.trim()
  if (!location) return { error: 'errLocation' }

  const choice = raw.shift.trim()
  let shift_scope: MachineShiftScope = 'none'
  let shift: AcademicShift | null = null
  if (choice === 'all') {
    if (!configuredShifts.length) return { error: 'errShift' }
    shift_scope = 'all'
  } else if (choice) {
    if (!isKnownAcademicShift(choice) || !configuredShifts.includes(choice)) return { error: 'errShift' }
    shift_scope = 'shift'
    shift = choice
  }

  return {
    machine_type: machineType,
    model,
    serial_number: serial,
    location,
    shift_scope,
    shift,
    note: raw.note.trim() || null,
  }
}

/** Longest card number accepted. Real cards are 8-20 characters; this only
 *  stops a stuck scanner or a pasted paragraph from being stored. */
export const RFID_MAX_LENGTH = 64

export type RfidParse = { ok: true; value: string | null } | { ok: false; error: 'errRfidInvalid' }

/** An RFID card number exactly as the reader typed it, minus surrounding
 *  whitespace (readers commonly append a newline or tab). Always a string —
 *  00012345 stays 00012345. Empty means "no card". Internal whitespace is
 *  refused: no card number contains it, and it usually means two scans ran
 *  together. */
export function parseRfid(raw: string): RfidParse {
  const value = raw.trim()
  if (!value) return { ok: true, value: null }
  if (value.length > RFID_MAX_LENGTH || /\s/.test(value)) return { ok: false, error: 'errRfidInvalid' }
  return { ok: true, value }
}

/** Where focus goes after Enter on row `from`: the next row without a card,
 *  so an operator working through a stack of new cards skips people who
 *  already have one; if every later row has a card, simply the next row; at
 *  the end of the list, nowhere (-1). */
export function nextRfidFocusIndex(values: readonly (string | null)[], from: number): number {
  for (let i = from + 1; i < values.length; i++) {
    if (!values[i]) return i
  }
  return from + 1 < values.length ? from + 1 : -1
}

/** The Employee Enrollment Shift filter's "employees with no Shift" value. */
export const NO_SHIFT_FILTER = 'none'

/** Narrows employees by the Shift filter: '' keeps everyone, NO_SHIFT_FILTER
 *  keeps those assigned no Shift, a Shift name keeps those who work it (an
 *  employee may work several). */
export function filterEmployeesByShift<T extends { id: string }>(
  employees: readonly T[],
  shiftsByEmployee: ReadonlyMap<string, readonly string[]>,
  shift: string,
): T[] {
  if (!shift) return [...employees]
  return employees.filter((e) => {
    const worked = shiftsByEmployee.get(e.id) ?? []
    return shift === NO_SHIFT_FILTER ? worked.length === 0 : worked.includes(shift)
  })
}
