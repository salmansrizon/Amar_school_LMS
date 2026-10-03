import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { ensureStaffLogin } from '../helpers/staff'
import { parseMachineInput, type MachineInput } from '@/lib/machine-attendance'
import {
  createMachine,
  deleteMachine,
  enrollmentInfo,
  listMachines,
  saveRfidEntries,
  updateMachine,
} from '@/lib/machine-enrollment-store'
import { schoolRoster } from '@/lib/school/roster-source'

// Seam: Machine Attendance persistence (issue #675) against the live schema —
// attendance_machines + machine_enroll_infos under RLS, employee_card's
// unique_id (0213), and the roster the Student RFID tab reuses.

const MARK = 'MA675'
const SERIAL = 'MA675-'

function machine(serial: string, shift = ''): MachineInput {
  const parsed = parseMachineInput(
    { machine_type: 'zkteco', model: 'K40', serial_number: serial, location: 'Main Gate', shift, note: '' },
    ['Morning', 'Day'],
  )
  if ('error' in parsed) throw new Error(parsed.error)
  return parsed
}

describe('Machine Attendance (#675)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let grantStaff: SupabaseClient
  let noGrantStaff: SupabaseClient

  async function cleanup() {
    await ownerA.from('attendance_machines').delete().like('serial_number', `${SERIAL}%`)
    await ownerB.from('attendance_machines').delete().like('serial_number', `${SERIAL}%`)
    await ownerA.from('students').delete().like('full_name', `${MARK}%`)
    await ownerA.from('employees').delete().like('full_name', `${MARK}%`)
  }

  async function student(name: string) {
    const { data } = await ownerA.from('students').insert({ full_name: `${MARK} ${name}` }).select('id, unique_id').single()
    return data!
  }

  async function employee(name: string) {
    const { data } = await ownerA.from('employees').insert({ full_name: `${MARK} ${name}` }).select('id, unique_id').single()
    return data!
  }

  async function rowCount(column: 'student_id' | 'employee_id', id: string) {
    const { data } = await ownerA.from('machine_enroll_infos').select('id, rfid_card_number').eq(column, id)
    return data ?? []
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    await ensureStaffLogin(ownerA, { email: 'ma675-grant@test.local', fullName: 'MA675 Attendance Staff', screens: ['attendance'] })
    await ensureStaffLogin(ownerA, { email: 'ma675-nogrant@test.local', fullName: 'MA675 No Grant Staff' })
    grantStaff = await signedIn('ma675-grant@test.local')
    noGrantStaff = await signedIn('ma675-nogrant@test.local')
    await cleanup()
  })

  afterAll(cleanup)

  describe('machine setup', () => {
    it('creates, edits and deletes a machine', async () => {
      expect(await createMachine(ownerA, machine(`${SERIAL}1`, 'Morning'))).toEqual({})
      const created = (await listMachines(ownerA)).find((m) => m.serial_number === `${SERIAL}1`)!
      expect(created).toMatchObject({ model: 'K40', location: 'Main Gate', shift_scope: 'shift', shift: 'Morning' })

      expect(await updateMachine(ownerA, created.id, { ...machine(`${SERIAL}1`, 'all'), location: 'Back Gate' })).toEqual({})
      const edited = (await listMachines(ownerA)).find((m) => m.id === created.id)!
      expect(edited).toMatchObject({ location: 'Back Gate', shift_scope: 'all', shift: null })

      expect(await deleteMachine(ownerA, created.id)).toEqual({})
      expect((await listMachines(ownerA)).some((m) => m.id === created.id)).toBe(false)
    })

    it('stores a no-shift machine', async () => {
      await createMachine(ownerA, machine(`${SERIAL}none`))
      const m = (await listMachines(ownerA)).find((x) => x.serial_number === `${SERIAL}none`)!
      expect(m).toMatchObject({ shift_scope: 'none', shift: null })
    })

    it('refuses a shift scope without a shift at the database too', async () => {
      const { error } = await ownerA.from('attendance_machines').insert({
        machine_type: 'zkteco',
        model: 'K40',
        serial_number: `${SERIAL}bad`,
        location: 'Gate',
        shift_scope: 'shift',
        shift: null,
      })
      expect(error?.message).toContain('attendance_machines_shift_matches_scope')
    })

    it('keeps serial numbers unique per school, not across schools', async () => {
      expect(await createMachine(ownerA, machine(`${SERIAL}dup`))).toEqual({})
      expect(await createMachine(ownerA, machine(`${SERIAL}dup`))).toEqual({ error: 'errSerialTaken' })
      expect(await createMachine(ownerB, machine(`${SERIAL}dup`))).toEqual({})
    })

    it("hides one school's machines from another", async () => {
      await createMachine(ownerA, machine(`${SERIAL}iso`))
      const mine = (await listMachines(ownerA)).find((m) => m.serial_number === `${SERIAL}iso`)!
      expect((await listMachines(ownerB)).some((m) => m.id === mine.id)).toBe(false)
      expect(await updateMachine(ownerB, mine.id, machine(`${SERIAL}iso`))).toEqual({ error: 'errNotFound' })
      expect(await deleteMachine(ownerB, mine.id)).toEqual({ error: 'errNotFound' })
    })

    it('opens to Attendance-grant staff and stays closed without the grant', async () => {
      expect(await createMachine(grantStaff, machine(`${SERIAL}staff`))).toEqual({})
      expect((await listMachines(grantStaff)).some((m) => m.serial_number === `${SERIAL}staff`)).toBe(true)
      expect(await createMachine(noGrantStaff, machine(`${SERIAL}nogrant`))).toEqual({ error: 'errSave' })
      expect(await listMachines(noGrantStaff)).toEqual([])
    })
  })

  describe('employee_card.unique_id', () => {
    it('shows the Machine ID to the owner and to Attendance-grant staff', async () => {
      const e = await employee('Card View')
      for (const client of [ownerA, grantStaff]) {
        const { data } = await client.from('employee_card').select('unique_id').eq('id', e.id).single()
        expect(data!.unique_id).toBe(e.unique_id)
      }
    })
  })

  describe('student RFID', () => {
    it('saves a card with leading zeros and reads it back exactly', async () => {
      const s = await student('Zeros')
      expect(await saveRfidEntries(ownerA, [{ kind: 'student', personId: s.id, card: '000675001' }])).toEqual([
        { personId: s.id, ok: true, card: '000675001' },
      ])
      expect((await enrollmentInfo(ownerA, 'student', [s.id])).get(s.id)).toEqual({ uniqueId: s.unique_id, card: '000675001' })
    })

    it('updates a card in place — one enrollment row per student', async () => {
      const s = await student('Edit')
      await saveRfidEntries(ownerA, [{ kind: 'student', personId: s.id, card: 'MA675-E1' }])
      await saveRfidEntries(ownerA, [{ kind: 'student', personId: s.id, card: 'MA675-E2' }])
      expect(await rowCount('student_id', s.id)).toEqual([expect.objectContaining({ rfid_card_number: 'MA675-E2' })])
    })

    it('refuses a duplicate card and names who holds it', async () => {
      const a = await student('Holder')
      const b = await student('Second')
      await saveRfidEntries(ownerA, [{ kind: 'student', personId: a.id, card: 'MA675-DUP' }])
      const [result] = await saveRfidEntries(ownerA, [{ kind: 'student', personId: b.id, card: 'MA675-DUP' }])
      expect(result).toEqual({ personId: b.id, ok: false, error: 'duplicate', holder: `${MARK} Holder` })
      expect(await rowCount('student_id', b.id)).toEqual([])
    })

    it('clearing a student card removes the enrollment', async () => {
      const s = await student('Clear')
      await saveRfidEntries(ownerA, [{ kind: 'student', personId: s.id, card: 'MA675-C1' }])
      expect(await saveRfidEntries(ownerA, [{ kind: 'student', personId: s.id, card: null }])).toEqual([
        { personId: s.id, ok: true, card: null },
      ])
      expect(await rowCount('student_id', s.id)).toEqual([])
      expect((await enrollmentInfo(ownerA, 'student', [s.id])).get(s.id)?.card).toBeNull()
    })

    it('saves a rapid batch of many cards, each on its own', async () => {
      const people = await Promise.all(Array.from({ length: 20 }, (_, i) => student(`Burst ${i}`)))
      const results = await saveRfidEntries(
        ownerA,
        people.map((p, i) => ({ kind: 'student' as const, personId: p.id, card: `MA675-B${String(i).padStart(4, '0')}` })),
      )
      expect(results.every((r) => r.ok)).toBe(true)
      const info = await enrollmentInfo(ownerA, 'student', people.map((p) => p.id))
      expect(info.get(people[3].id)?.card).toBe('MA675-B0003')
    })

    it("cannot enroll another school's student", async () => {
      const s = await student('Other School')
      const [result] = await saveRfidEntries(ownerB, [{ kind: 'student', personId: s.id, card: 'MA675-X' }])
      expect(result).toEqual({ personId: s.id, ok: false, error: 'notFound' })
    })

    it('refuses an invalid card value', async () => {
      const s = await student('Invalid')
      const [result] = await saveRfidEntries(ownerA, [{ kind: 'student', personId: s.id, card: '01 02' }])
      expect(result).toEqual({ personId: s.id, ok: false, error: 'invalid' })
    })
  })

  describe('employee RFID', () => {
    it('saves with leading zeros, and clearing keeps the employee enrolled with no card', async () => {
      const e = await employee('Finger')
      await saveRfidEntries(ownerA, [{ kind: 'employee', personId: e.id, card: '000777' }])
      expect((await enrollmentInfo(ownerA, 'employee', [e.id])).get(e.id)).toEqual({ uniqueId: e.unique_id, card: '000777' })

      await saveRfidEntries(ownerA, [{ kind: 'employee', personId: e.id, card: null }])
      expect(await rowCount('employee_id', e.id)).toEqual([expect.objectContaining({ rfid_card_number: null })])
    })

    it('refuses a card already held by a student', async () => {
      const s = await student('Card Owner')
      const e = await employee('Card Thief')
      await saveRfidEntries(ownerA, [{ kind: 'student', personId: s.id, card: 'MA675-SHARED' }])
      const [result] = await saveRfidEntries(ownerA, [{ kind: 'employee', personId: e.id, card: 'MA675-SHARED' }])
      expect(result).toMatchObject({ ok: false, error: 'duplicate', holder: `${MARK} Card Owner` })
    })

    it('lets Attendance-grant staff enter employee cards', async () => {
      const e = await employee('Staff Entered')
      expect(await saveRfidEntries(grantStaff, [{ kind: 'employee', personId: e.id, card: 'MA675-STAFF' }])).toEqual([
        { personId: e.id, ok: true, card: 'MA675-STAFF' },
      ])
    })
  })

  describe('student roster for RFID entry', () => {
    it('narrows to the chosen class and pairs each student with their Machine ID', async () => {
      const all = await schoolRoster(ownerA, {})
      const seed = all.combos.find((c) => c.label.startsWith('Seed Class'))
      expect(seed).toBeDefined()
      const view = await schoolRoster(ownerA, { classSection: seed!.value })
      expect(view.students.length).toBeGreaterThan(0)
      expect(view.students.every((s) => s.class_name === 'Seed Class')).toBe(true)

      const info = await enrollmentInfo(ownerA, 'student', view.students.map((s) => s.id))
      expect(view.students.every((s) => typeof info.get(s.id)?.uniqueId === 'number')).toBe(true)
    })
  })
})
