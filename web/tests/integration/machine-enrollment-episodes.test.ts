import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, anonClient } from '../helpers/auth'
import { ensureStaffLogin } from '../helpers/staff'
import { schoolFixtures } from '../helpers/school-fixture'

// Machine Attendance Phase 3 (migration 0220, ADR 0033): enrollment episodes —
// the permanent history of which person a device user ID meant on one machine,
// over the end-exclusive window [linked_at, unlinked_at). Schema only: no
// provisioning function exists yet, so Super Admin (the only writer the table
// allows) stands in for it.
//
// Episodes cannot be deleted by any application role, so:
//   * almost everything runs on a disposable School, removed by School cascade;
//   * School A (needed for the owner/staff visibility checks) holds ONE
//     well-known fixture — machine EPI-FIXTURE-A, student "Episode Fixture
//     Student", one closed episode — created on first run and reused after.

const T = (h: number) => new Date(Date.UTC(2026, 8, 1, h)).toISOString() // 2026-09-01 hh:00Z

describe('attendance_machine_enrollments episodes (Machine Attendance Phase 3)', () => {
  let admin: SupabaseClient
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let grantStaff: SupabaseClient
  let schoolA: string
  let scratch: string
  let m1: string
  let m2: string
  let student1: string
  let student2: string
  let employee1: string
  let fixtureEpisode: string
  let fixtureMachineA: string
  let userSeq = 0
  const schools = schoolFixtures(() => admin)

  /** A fresh device user ID per test, so open-episode rules never collide across tests. */
  const nextUser = () => `9999${String(1000 + ++userSeq)}`

  const insertEpisode = (row: Record<string, unknown>) =>
    admin
      .from('attendance_machine_enrollments')
      .insert({ school_id: scratch, machine_id: m1, entity_type: 'student', student_id: student1, ...row })
      .select('id, linked_at, unlinked_at, sync_state')
      .single()

  const episode = async (client: SupabaseClient, id: string) =>
    (await client.from('attendance_machine_enrollments').select('*').eq('id', id).maybeSingle()).data

  const machine = async (school: string, serial: string) => {
    const { data, error } = await admin
      .from('attendance_machines')
      .insert({ school_id: school, machine_type: 'zkteco', model: 'K40', serial_number: serial, location: 'Episode Test Gate', shift_scope: 'none' })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data.id as string
  }

  const person = async (table: 'students' | 'employees', school: string, name: string) => {
    const { data, error } = await admin.from(table).insert({ school_id: school, full_name: name }).select('id').single()
    if (error) throw new Error(error.message)
    return data.id as string
  }

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    const { data: { user } } = await ownerA.auth.getUser()
    schoolA = (await ownerA.from('profiles').select('school_id').eq('id', user!.id).single()).data!.school_id
    await ensureStaffLogin(ownerA, { email: 'ma675-grant@test.local', fullName: 'MA675 Attendance Staff', screens: ['attendance'] })
    grantStaff = await signedIn('ma675-grant@test.local')

    scratch = await schools.create({ name: 'ZZ Enrollment Episodes Test School' })
    m1 = await machine(scratch, 'EPI-TEST-1')
    m2 = await machine(scratch, 'EPI-TEST-2')
    student1 = await person('students', scratch, 'Episode Student One')
    student2 = await person('students', scratch, 'Episode Student Two')
    employee1 = await person('employees', scratch, 'Episode Employee One')

    // School A's well-known fixture (reused across runs; never mutated).
    const existing = await admin.from('attendance_machines').select('id').eq('school_id', schoolA).eq('serial_number', 'EPI-FIXTURE-A').maybeSingle()
    fixtureMachineA = existing.data?.id ?? (await machine(schoolA, 'EPI-FIXTURE-A'))
    const found = await admin.from('attendance_machine_enrollments').select('id').eq('machine_id', fixtureMachineA).eq('machine_user_id', '99990999').maybeSingle()
    if (found.data) {
      fixtureEpisode = found.data.id
    } else {
      const s = await admin.from('students').select('id').eq('school_id', schoolA).eq('full_name', 'Episode Fixture Student').maybeSingle()
      const fixtureStudent = s.data?.id ?? (await person('students', schoolA, 'Episode Fixture Student'))
      const { data, error } = await admin
        .from('attendance_machine_enrollments')
        .insert({
          school_id: schoolA, machine_id: fixtureMachineA, machine_user_id: '99990999', entity_type: 'student',
          student_id: fixtureStudent, linked_at: T(1), unlinked_at: T(2), sync_state: 'removed', desired_state: 'absent',
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      fixtureEpisode = data.id
    }
  })

  afterAll(async () => {
    await schools.cleanup() // episodes, machines and people of the disposable School go with it
  })

  describe('shape', () => {
    it('represents a pending episode and a linked (active) episode', async () => {
      const pending = await insertEpisode({ machine_user_id: nextUser() })
      expect(pending.error).toBeNull()
      expect(pending.data).toMatchObject({ linked_at: null, unlinked_at: null, sync_state: 'pending' })
      const active = await insertEpisode({ machine_user_id: nextUser(), student_id: student2, linked_at: T(3), sync_state: 'synced' })
      expect(active.error).toBeNull()
    })

    it('an employee episode references the employee, and the person must match the entity type', async () => {
      expect((await insertEpisode({ machine_user_id: nextUser(), entity_type: 'employee', student_id: null, employee_id: employee1 })).error).toBeNull()
      expect((await insertEpisode({ machine_user_id: nextUser(), entity_type: 'employee' })).error).not.toBeNull()
    })

    it('the machine and the person must belong to the same School', async () => {
      expect((await insertEpisode({ machine_user_id: nextUser(), machine_id: fixtureMachineA })).error).not.toBeNull()
      const studentA = (await admin.from('attendance_machine_enrollments').select('student_id').eq('id', fixtureEpisode).single()).data!.student_id
      expect((await insertEpisode({ machine_user_id: nextUser(), student_id: studentA })).error).not.toBeNull()
    })

    it('validates the device user ID', async () => {
      for (const bad of ['', ' 1001', '10 01', 'x'.repeat(65)]) {
        expect((await insertEpisode({ machine_user_id: bad })).error, JSON.stringify(bad)).not.toBeNull()
      }
    })
  })

  describe('one open episode, never overlapping', () => {
    it('allows one open episode and rejects a second open one for the same device user', async () => {
      const id = nextUser()
      expect((await insertEpisode({ machine_user_id: id })).error).toBeNull()
      const second = await insertEpisode({ machine_user_id: id, student_id: student2 })
      expect(second.error?.message).toMatch(/attendance_machine_enrollments_one_open/)
    })

    it('another device user on the same machine, or the same device user on another machine, is independent', async () => {
      const id = nextUser()
      expect((await insertEpisode({ machine_user_id: id, linked_at: T(1) })).error).toBeNull()
      expect((await insertEpisode({ machine_user_id: nextUser(), student_id: student2, linked_at: T(1) })).error).toBeNull()
      expect((await insertEpisode({ machine_user_id: id, machine_id: m2, linked_at: T(1) })).error).toBeNull()
    })

    it('allows several closed, non-overlapping historical episodes', async () => {
      const id = nextUser()
      expect((await insertEpisode({ machine_user_id: id, linked_at: T(1), unlinked_at: T(2), sync_state: 'removed' })).error).toBeNull()
      expect((await insertEpisode({ machine_user_id: id, student_id: student2, linked_at: T(5), unlinked_at: T(6), sync_state: 'removed' })).error).toBeNull()
      expect((await insertEpisode({ machine_user_id: id, linked_at: T(8) })).error).toBeNull() // and a new open one
    })

    it('rejects overlapping link windows for the same device user', async () => {
      const id = nextUser()
      expect((await insertEpisode({ machine_user_id: id, linked_at: T(2), unlinked_at: T(4), sync_state: 'removed' })).error).toBeNull()
      const overlap = await insertEpisode({ machine_user_id: id, student_id: student2, linked_at: T(3), unlinked_at: T(5), sync_state: 'removed' })
      expect(overlap.error?.message).toMatch(/attendance_machine_enrollments_no_overlap/)
      const openOverlap = await insertEpisode({ machine_user_id: id, student_id: student2, linked_at: T(1) }) // [01:00, ∞) covers [02:00, 04:00)
      expect(openOverlap.error?.message).toMatch(/attendance_machine_enrollments_no_overlap/)
    })

    it('windows are end-exclusive: an episode may start exactly when the previous one ended', async () => {
      const id = nextUser()
      expect((await insertEpisode({ machine_user_id: id, linked_at: T(1), unlinked_at: T(2), sync_state: 'removed' })).error).toBeNull()
      expect((await insertEpisode({ machine_user_id: id, student_id: student2, linked_at: T(2), unlinked_at: T(3), sync_state: 'removed' })).error).toBeNull()
    })

    it('a window must end strictly after it starts', async () => {
      expect((await insertEpisode({ machine_user_id: nextUser(), linked_at: T(2), unlinked_at: T(2) })).error).not.toBeNull()
      expect((await insertEpisode({ machine_user_id: nextUser(), linked_at: T(2), unlinked_at: T(1) })).error).not.toBeNull()
    })
  })

  describe('history is immutable', () => {
    let open: string

    beforeAll(async () => {
      open = (await insertEpisode({ machine_user_id: nextUser(), linked_at: T(1), sync_state: 'synced' })).data!.id
    })

    it('the person, entity type, machine and device user ID can never change', async () => {
      for (const change of [
        { student_id: student2 },
        { entity_type: 'employee', student_id: null, employee_id: employee1 },
        { machine_id: m2 },
        { machine_user_id: nextUser() },
      ]) {
        const r = await admin.from('attendance_machine_enrollments').update(change).eq('id', open)
        expect(r.error, JSON.stringify(change)).not.toBeNull()
      }
    })

    it('operational state of an open episode may change (desired version, sync state, card snapshot)', async () => {
      const r = await admin
        .from('attendance_machine_enrollments')
        .update({ desired_version: 2, sync_state: 'synced', last_synced_card: '4972001', synced_at: T(1) })
        .eq('id', open)
      expect(r.error).toBeNull()
    })

    it('linked_at is set once', async () => {
      const pending = (await insertEpisode({ machine_user_id: nextUser() })).data!.id
      expect((await admin.from('attendance_machine_enrollments').update({ linked_at: T(1) }).eq('id', pending)).error).toBeNull()
      expect((await admin.from('attendance_machine_enrollments').update({ linked_at: T(2) }).eq('id', pending)).error?.message).toMatch(/set once/)
    })

    it('closes once; a closed episode cannot be reopened or re-dated', async () => {
      expect((await admin.from('attendance_machine_enrollments').update({ unlinked_at: T(4), sync_state: 'removed' }).eq('id', open)).error).toBeNull()
      expect((await admin.from('attendance_machine_enrollments').update({ unlinked_at: null }).eq('id', open)).error?.message).toMatch(/cannot be reopened/)
      expect((await admin.from('attendance_machine_enrollments').update({ unlinked_at: T(6) }).eq('id', open)).error).not.toBeNull()
      expect((await admin.from('attendance_machine_enrollments').update({ unlinked_at: T(3) }).eq('id', open)).error).not.toBeNull()
      expect((await episode(admin, open))!.unlinked_at).toBe(T(4).replace('.000Z', '+00:00'))
    })

    it('a cancelled (never-linked) episode can never become linked', async () => {
      const pending = (await insertEpisode({ machine_user_id: nextUser() })).data!.id
      expect((await admin.from('attendance_machine_enrollments').update({ unlinked_at: T(2), sync_state: 'cancelled' }).eq('id', pending)).error).toBeNull()
      expect((await admin.from('attendance_machine_enrollments').update({ linked_at: T(1) }).eq('id', pending)).error?.message).toMatch(/cancelled/)
    })

    it('history survives deleting the machine_enroll_infos row: only enroll_info_id clears', async () => {
      const { data: s } = await admin.from('students').select('unique_id').eq('id', student2).single()
      const { data: info, error } = await admin
        .from('machine_enroll_infos')
        .insert({ school_id: scratch, type: 'student', student_id: student2, unique_id: s!.unique_id, rfid_card_number: 'EPI-CARD-1' })
        .select('id')
        .single()
      expect(error).toBeNull()
      const ep = (await insertEpisode({ machine_user_id: String(s!.unique_id), student_id: student2, enroll_info_id: info!.id, linked_at: T(9) })).data!.id
      expect((await admin.from('machine_enroll_infos').delete().eq('id', info!.id)).error).toBeNull()
      expect(await episode(admin, ep)).toMatchObject({ enroll_info_id: null, student_id: student2, linked_at: expect.any(String) })
    })
  })

  describe('access', () => {
    it('School members read their own School\'s episodes; another School does not', async () => {
      expect((await episode(ownerA, fixtureEpisode))?.id).toBe(fixtureEpisode)
      expect((await episode(grantStaff, fixtureEpisode))?.id).toBe(fixtureEpisode)
      expect(await episode(ownerB, fixtureEpisode)).toBeNull()
      expect(await episode(anonClient(), fixtureEpisode)).toBeNull()
    })

    it('School users cannot create, rewrite, close or delete episodes', async () => {
      const before = await episode(admin, fixtureEpisode)
      for (const c of [ownerA, grantStaff]) {
        const ins = await c.from('attendance_machine_enrollments').insert({
          school_id: schoolA, machine_id: fixtureMachineA, machine_user_id: '99990998', entity_type: 'student', student_id: before!.student_id,
        })
        expect(ins.error).not.toBeNull()
        await c.from('attendance_machine_enrollments').update({ sync_state: 'failed', last_error: 'x' }).eq('id', fixtureEpisode)
        expect((await c.from('attendance_machine_enrollments').delete().eq('id', fixtureEpisode)).error).not.toBeNull()
      }
      expect(await episode(admin, fixtureEpisode)).toEqual(before)
    })

    it('no application role can delete an episode, Super Admin included', async () => {
      expect((await admin.from('attendance_machine_enrollments').delete().eq('id', fixtureEpisode)).error).not.toBeNull()
      expect(await episode(admin, fixtureEpisode)).not.toBeNull()
    })
  })

  describe('machine lifecycle keeps history', () => {
    it('a machine with enrollment history cannot be hard-deleted', async () => {
      expect((await admin.from('attendance_machines').delete().eq('id', m1)).error).not.toBeNull()
    })

    it('archiving and restoring a machine leaves its episodes untouched', async () => {
      const ep = (await insertEpisode({ machine_user_id: nextUser(), machine_id: m2, linked_at: T(10) })).data!.id
      const before = await episode(admin, ep)
      expect((await admin.rpc('archive_attendance_machine', { machine_id: m2 })).error).toBeNull()
      expect(await episode(admin, ep)).toEqual(before)
      expect((await admin.rpc('restore_attendance_machine', { machine_id: m2 })).error).toBeNull()
      expect(await episode(admin, ep)).toEqual(before)
    })
  })
})
