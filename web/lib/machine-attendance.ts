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

/** The TCP port a vendor's devices listen on unless the School changed it:
 *  ZKTeco's standard 4370, and 5005 as configured on the TIMY TM52GPRS the
 *  Phase 1A POC proved (ADR 0033). The Attendance Agent connects to it. */
export const DEFAULT_MACHINE_PORT: Record<MachineType, number> = { zkteco: 4370, timmy: 5005 }

/** The Attendance Agent driver a machine is pinned to (Baseline §11). 'auto'
 *  lets the Agent choose; the TIMY TM52GPRS driver is the only production
 *  driver so far (Phase 5). Driver keys are not translated. */
export const DRIVER_KEYS = [
  { value: 'auto', label: 'Auto' },
  { value: 'timmy-sdk-fpclock', label: 'TIMY SDK (TM52GPRS)' },
] as const

export function isDriverKey(value: string): boolean {
  return DRIVER_KEYS.some((d) => d.value === value)
}

/** A new machine's driver: the TIMY driver for Timmy machines, 'auto' otherwise. */
export function defaultDriverKey(type: MachineType): string {
  return type === 'timmy' ? 'timmy-sdk-fpclock' : 'auto'
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
  /** LAN address the Attendance Agent connects to; null until entered. */
  host: string | null
  port: number
  time_zone: string
  enabled: boolean
  /** The Attendance Agent that serves this machine (ADR 0033), or null. */
  agent_id?: string | null
  driver_key?: string
  /** Reported by the Agent: a communication key is set on the Agent PC (the key never reaches the cloud). */
  credential_configured?: boolean
  /** Set once the device itself reported the registered serial. */
  serial_verified_at?: string | null
  /** Set while archived (ADR 0033: a used machine is archived, not deleted). */
  archived_at: string | null
  /** The machine this one replaced, for replacement hardware. */
  replaces_machine_id: string | null
}

export interface MachineInput {
  machine_type: MachineType
  model: string
  serial_number: string
  location: string
  shift_scope: MachineShiftScope
  shift: AcademicShift | null
  note: string | null
  host: string | null
  port: number
  /** Present only when the form submitted them, so older callers never reset them. */
  agent_id?: string | null
  driver_key?: string
  enabled?: boolean
}

export type MachineInputError =
  | 'errMachineType'
  | 'errModel'
  | 'errSerial'
  | 'errLocation'
  | 'errShift'
  | 'errHost'
  | 'errPort'
  | 'errAgent'
  | 'errDriver'

// A LAN hostname or IPv4/IPv6 address as typed — letters, digits, '.', '-',
// ':' (IPv6), at most 253 characters. Reachability is the Agent's to test.
const HOST = /^[A-Za-z0-9.:-]{1,253}$/

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
    /** Optional so older callers keep working: absent host is "not entered",
     *  absent or empty port is the vendor's default. */
    host?: string
    port?: string
    /** Optional (Phase 6): '' = no Agent, else the Agent's id. */
    agent_id?: string
    /** Optional (Phase 6): one of DRIVER_KEYS. */
    driver_key?: string
    /** Optional (Phase 6): 'on' / 'true' when the machine is enabled. */
    enabled?: string
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

  const host = (raw.host ?? '').trim()
  if (host && !HOST.test(host)) return { error: 'errHost' }
  const portText = (raw.port ?? '').trim()
  let port = DEFAULT_MACHINE_PORT[machineType]
  if (portText) {
    if (!/^\d{1,5}$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) return { error: 'errPort' }
    port = Number(portText)
  }

  const out: MachineInput = {
    machine_type: machineType,
    model,
    serial_number: serial,
    location,
    shift_scope,
    shift,
    note: raw.note.trim() || null,
    host: host || null,
    port,
  }
  if (raw.agent_id !== undefined) {
    const agent = raw.agent_id.trim()
    if (agent && !UUID.test(agent)) return { error: 'errAgent' }
    out.agent_id = agent || null
  }
  if (raw.driver_key !== undefined) {
    const driver = raw.driver_key.trim() || defaultDriverKey(machineType)
    if (!isDriverKey(driver)) return { error: 'errDriver' }
    out.driver_key = driver
  }
  if (raw.enabled !== undefined) out.enabled = raw.enabled === 'on' || raw.enabled === 'true'
  return out
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Machines still in service (not archived) — the ones enrollment screens
 *  and the Agent work with. */
export function activeMachines<T extends Pick<AttendanceMachine, 'archived_at'>>(machines: readonly T[]): T[] {
  return machines.filter((m) => m.archived_at === null)
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
