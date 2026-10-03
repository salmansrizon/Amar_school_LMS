import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { enrollCard } from '../helpers/machine-enroll'

// Seam: numeric machine unique_id on students/employees + machine_enroll_infos,
// the single RFID/enrollment source (migrations 0211/0212, superseding #564's
// prefixed ids and #565's profile rfid_card_number). ownerA and ownerB are
// different Schools — required because unique_id must be unique *across*
// tenants, which a single-school suite can't exercise. No machine
// communication exists; this only pins the data model.

const MARK = 'MEI'

describe('machine identity (0211/0212)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let admin: SupabaseClient

  async function cleanup() {
    // Enrollments cascade from their person.
    await admin.from('students').delete().like('full_name', `${MARK}%`)
    await admin.from('employees').delete().like('full_name', `${MARK}%`)
  }

  async function student(owner: SupabaseClient, name: string) {
    const { data } = await owner.from('students').insert({ full_name: `${MARK} ${name}` }).select('id, unique_id').single()
    return data!
  }

  async function employee(owner: SupabaseClient, name: string) {
    const { data } = await owner.from('employees').insert({ full_name: `${MARK} ${name}` }).select('id, unique_id').single()
    return data!
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    admin = await signedIn('super@test.local')
    await cleanup()
  })

  afterAll(cleanup)

  describe('unique_id', () => {
    it('is a positive integer, with no stu/emp prefix, for students and employees', async () => {
      const s = await student(ownerA, 'Num')
      const e = await employee(ownerA, 'EmpNum')
      expect(Number.isInteger(s.unique_id)).toBe(true)
      expect(Number.isInteger(e.unique_id)).toBe(true)
      expect(s.unique_id).toBeGreaterThan(0)
      expect(e.unique_id).toBeGreaterThan(0)
    })

    it('never collides between a student and an employee (one shared sequence)', async () => {
      const s = await student(ownerA, 'Shared')
      const e = await employee(ownerA, 'EmpShared')
      expect(e.unique_id).not.toBe(s.unique_id)
    })

    it('is globally unique — two different schools never collide', async () => {
      const a = await student(ownerA, 'A')
      const b = await student(ownerB, 'B')
      expect(a.unique_id).not.toBe(b.unique_id)
    })

    it('refuses a caller-supplied value', async () => {
      const { error } = await ownerA.from('employees').insert({ full_name: `${MARK} Explicit`, unique_id: 123 })
      expect(error).not.toBeNull()
      expect(error!.message).toContain('unique_id is assigned automatically')
    })

    it('is immutable after insert', async () => {
      const s = await student(ownerA, 'Immut')
      const { error } = await ownerA.from('students').update({ unique_id: 99999999 }).eq('id', s.id)
      expect(error).not.toBeNull()
      expect(error!.message).toContain('unique_id is immutable')
    })
  })

  describe('machine_enroll_infos', () => {
    it('enrolls a student with a card and an employee without one', async () => {
      const s = await student(ownerA, 'Card')
      const e = await employee(ownerA, 'Finger')
      const a = await enrollCard(ownerA, { student_id: s.id }, 'MEI-CARD-1')
      const b = await ownerA
        .from('machine_enroll_infos')
        .insert({ type: 'employee', employee_id: e.id, unique_id: e.unique_id })
        .select('rfid_card_number')
        .single()
      expect(a.error).toBeNull()
      expect(b.error).toBeNull()
      expect(b.data!.rfid_card_number).toBeNull()
    })

    it('rejects a type that disagrees with the person it references', async () => {
      const s = await student(ownerA, 'WrongType')
      const { error } = await ownerA
        .from('machine_enroll_infos')
        .insert({ type: 'employee', student_id: s.id, unique_id: s.unique_id })
      expect(error).not.toBeNull()
      expect(error!.message).toContain('machine_enroll_infos_type_matches_person')
    })

    it("rejects a unique_id that is not the person's own", async () => {
      const s = await student(ownerA, 'Mine')
      const other = await student(ownerA, 'Other')
      const { error } = await ownerA
        .from('machine_enroll_infos')
        .insert({ type: 'student', student_id: s.id, unique_id: other.unique_id })
      expect(error).not.toBeNull()
      expect(error!.code).toBe('23503')
    })

    it('enrolls a person at most once', async () => {
      const e = await employee(ownerA, 'Twice')
      await ownerA.from('machine_enroll_infos').insert({ type: 'employee', employee_id: e.id, unique_id: e.unique_id })
      const { error } = await ownerA
        .from('machine_enroll_infos')
        .insert({ type: 'employee', employee_id: e.id, unique_id: e.unique_id })
      expect(error).not.toBeNull()
      expect(error!.message).toContain('machine_enroll_infos_unique_id_key')
    })

    it('rejects a duplicate card number within the same school', async () => {
      const s = await student(ownerA, 'Dup1')
      const e = await employee(ownerA, 'Dup2')
      await enrollCard(ownerA, { student_id: s.id }, 'MEI-CARD-2')
      const { error } = await enrollCard(ownerA, { employee_id: e.id }, 'MEI-CARD-2')
      expect(error).not.toBeNull()
      expect(error!.message).toContain('machine_enroll_infos_rfid_card_number_key')
    })

    it('lets a different school reuse the same card number', async () => {
      const a = await student(ownerA, 'ReuseA')
      const b = await student(ownerB, 'ReuseB')
      expect((await enrollCard(ownerA, { student_id: a.id }, 'MEI-CARD-3')).error).toBeNull()
      expect((await enrollCard(ownerB, { student_id: b.id }, 'MEI-CARD-3')).error).toBeNull()
    })

    it('is removed with the person it enrolls', async () => {
      const s = await student(ownerA, 'Gone')
      await enrollCard(ownerA, { student_id: s.id }, 'MEI-CARD-4')
      await ownerA.from('students').delete().eq('id', s.id)
      const { data } = await ownerA.from('machine_enroll_infos').select('id').eq('rfid_card_number', 'MEI-CARD-4')
      expect(data).toHaveLength(0)
    })
  })

  describe('legacy RFID sources (0212)', () => {
    it('students and employees no longer carry rfid_card_number', async () => {
      expect((await ownerA.from('students').select('rfid_card_number').limit(1)).error).not.toBeNull()
      expect((await ownerA.from('employees').select('rfid_card_number').limit(1)).error).not.toBeNull()
    })

    it('rfid_cards no longer exists', async () => {
      expect((await ownerA.from('rfid_cards').select('id').limit(1)).error).not.toBeNull()
    })
  })
})
