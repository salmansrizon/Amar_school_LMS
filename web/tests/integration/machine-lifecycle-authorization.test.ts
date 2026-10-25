import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, anonClient, PASSWORD } from '../helpers/auth'
import { ensureStaffLogin } from '../helpers/staff'

// Migration 0266 (#677): archive / restore / replace an attendance machine
// follow the machine-write rule 0240 applies to the table itself — the
// Attendance grant AND (School Owner OR a Staff User with no employees row) —
// in the machine's own School; Super Admin for any School.
//
// Actors (School A unless noted):
//   owner-a                    School Owner                       allowed
//   ma675-grant                office staff + Attendance grant    allowed
//   super                      Super Admin                        allowed
//   teacher-e2e                Staff User WITH an employees row,
//                              Attendance grant held for the run  refused
//   ma675-nogrant              office staff, no Attendance grant  refused
//   s9001                      Student                            refused
//   anon                       no session                         refused
//   owner-b                    another School's Owner             refused
//
// Every machine is created by owner-a with an MLA-TEST- serial and deleted
// afterwards (newest first: replacements reference what they replaced).

const SERIAL = (n: string) => `MLA-TEST-${n}-${crypto.randomUUID().slice(0, 8)}`

describe('machine lifecycle authorization (0266, #677)', () => {
  let admin: SupabaseClient
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let office: SupabaseClient
  let teacher: SupabaseClient
  let noGrant: SupabaseClient
  let student: SupabaseClient
  let teacherGrantAdded = false
  let teacherId: string

  const create = async (n: string) => {
    const { data, error } = await ownerA
      .from('attendance_machines')
      .insert({ machine_type: 'timmy', model: 'TM52GPRS', serial_number: SERIAL(n), location: 'Lifecycle Auth Gate', shift_scope: 'none' })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data.id as string
  }
  const archivedAt = async (id: string) =>
    (await admin.from('attendance_machines').select('archived_at').eq('id', id).single()).data!.archived_at as string | null
  const replacements = async (id: string) =>
    (await admin.from('attendance_machines').select('id').eq('replaces_machine_id', id)).data!.length

  const archive = (c: SupabaseClient, id: string) => c.rpc('archive_attendance_machine', { machine_id: id })
  const restore = (c: SupabaseClient, id: string) => c.rpc('restore_attendance_machine', { machine_id: id })
  const replace = (c: SupabaseClient, id: string) =>
    c.rpc('replace_attendance_machine', { machine_id: id, new_serial_number: SERIAL('new') })

  const cleanup = async () => {
    const { data } = await admin
      .from('attendance_machines')
      .select('id')
      .like('serial_number', 'MLA-TEST-%')
      .order('created_at', { ascending: false })
    for (const m of data ?? []) await admin.from('attendance_machines').delete().eq('id', m.id)
  }

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    await ensureStaffLogin(ownerA, { email: 'ma675-grant@test.local', fullName: 'MA675 Attendance Staff', screens: ['attendance'] })
    await ensureStaffLogin(ownerA, { email: 'ma675-nogrant@test.local', fullName: 'MA675 No Grant Staff' })
    office = await signedIn('ma675-grant@test.local')
    noGrant = await signedIn('ma675-nogrant@test.local')
    teacher = await signedIn('teacher-e2e@test.local', PASSWORD)
    student = await signedIn('s9001@test-a.students.invalid', PASSWORD)
    teacherId = (await teacher.auth.getUser()).data.user!.id
    // The teacher holds the Attendance grant for the run; it is taken back only if this suite added it.
    const { error } = await ownerA.from('staff_permissions').insert({ staff_user_id: teacherId, screen_key: 'attendance' })
    teacherGrantAdded = !error
    // Preconditions of the rule itself: the teacher is employee-backed, the office user is not.
    expect(await teacher.rpc('app_class_scope').then((r) => r.data)).not.toBe('school-wide')
    expect(await office.rpc('app_class_scope').then((r) => r.data)).toBe('school-wide')
    await cleanup()
  })

  afterAll(async () => {
    await cleanup()
    if (teacherGrantAdded) await ownerA.from('staff_permissions').delete().eq('staff_user_id', teacherId).eq('screen_key', 'attendance')
  })

  describe('allowed', () => {
    for (const [who, client] of [
      ['School Owner', () => ownerA],
      ['office staff with the Attendance grant', () => office],
      ['Super Admin', () => admin],
    ] as const) {
      it(`${who}: archive, restore, replace`, async () => {
        const c = client()
        const id = await create('ok')
        expect((await archive(c, id)).error).toBeNull()
        expect(await archivedAt(id)).not.toBeNull()
        expect((await restore(c, id)).error).toBeNull()
        expect(await archivedAt(id)).toBeNull()
        const r = await replace(c, id)
        expect(r.error).toBeNull()
        expect(r.data).toMatch(/^[0-9a-f-]{36}$/)
        expect(await archivedAt(id)).not.toBeNull()
        expect(await replacements(id)).toBe(1)
      })
    }
  })

  describe('refused, and nothing changes', () => {
    for (const [who, client] of [
      ['a teacher holding the Attendance grant', () => teacher],
      ['office staff without the Attendance grant', () => noGrant],
      ['a Student', () => student],
      ['another School (foreign machine id)', () => ownerB],
    ] as const) {
      it(`${who}`, async () => {
        const c = client()
        const live = await create('refused-live')
        const archived = await create('refused-arc')
        expect((await archive(ownerA, archived)).error).toBeNull()
        const before = await archivedAt(archived)

        for (const res of [await archive(c, live), await restore(c, archived), await replace(c, live)]) {
          expect(res.error?.code).toBe('P0002')
          expect(res.error?.message).toBe('attendance machine not found')
        }
        expect(await archivedAt(live)).toBeNull()
        expect(await archivedAt(archived)).toBe(before)
        expect(await replacements(live)).toBe(0)
      })
    }

    it('anon has no EXECUTE at all', async () => {
      const id = await create('anon')
      for (const res of [await archive(anonClient(), id), await restore(anonClient(), id), await replace(anonClient(), id)]) {
        expect(res.error).not.toBeNull()
      }
      expect(await archivedAt(id)).toBeNull()
      expect(await replacements(id)).toBe(0)
    })
  })
})
