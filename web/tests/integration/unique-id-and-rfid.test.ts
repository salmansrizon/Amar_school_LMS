import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: unique_id + rfid_card_number on students/employees (ticket #564,
// data-model prep for future attendance-machine sync — no machine
// integration, no sync service, no ingest wiring here). ownerA and ownerB
// are different Schools — required because the whole point of unique_id is
// uniqueness *across* tenants, which a single-school suite can't exercise.

const MARK = 'ST564'

describe('unique_id + rfid_card_number (ticket #564)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let admin: SupabaseClient

  async function cleanup() {
    await admin.from('students').delete().like('full_name', `${MARK}%`)
    await admin.from('employees').delete().like('full_name', `${MARK}%`)
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    admin = await signedIn('super@test.local')
    await cleanup()
  })

  afterAll(cleanup)

  describe('students.unique_id', () => {
    it('is auto-assigned on admission, stu-prefixed, 8 digits', async () => {
      const { data, error } = await ownerA
        .from('students')
        .insert({ full_name: `${MARK} A1` })
        .select('unique_id')
        .single()
      expect(error).toBeNull()
      expect(data!.unique_id).toMatch(/^stu[0-9]{8}$/)
    })

    it('is globally unique — two different schools never collide', async () => {
      const a = await ownerA.from('students').insert({ full_name: `${MARK} A2` }).select('unique_id').single()
      const b = await ownerB.from('students').insert({ full_name: `${MARK} B1` }).select('unique_id').single()
      expect(a.error).toBeNull()
      expect(b.error).toBeNull()
      expect(a.data!.unique_id).not.toBe(b.data!.unique_id)
    })

    it('rejects an explicit duplicate unique_id (global unique index)', async () => {
      const first = await ownerA
        .from('students')
        .insert({ full_name: `${MARK} Dup1` })
        .select('unique_id')
        .single()
      const { error } = await ownerA
        .from('students')
        .insert({ full_name: `${MARK} Dup2`, unique_id: first.data!.unique_id })
      expect(error).not.toBeNull()
      expect(error!.code).toBe('23505')
    })

    it('is immutable after insert', async () => {
      const { data } = await ownerA.from('students').insert({ full_name: `${MARK} Immut` }).select('id').single()
      const { error } = await ownerA
        .from('students')
        .update({ unique_id: 'stu99999999' })
        .eq('id', data!.id)
      expect(error).not.toBeNull()
      expect(error!.message).toContain('unique_id is immutable')
    })
  })

  describe('employees.unique_id', () => {
    it('is auto-assigned on creation, emp-prefixed, 8 digits', async () => {
      const { data, error } = await ownerA
        .from('employees')
        .insert({ full_name: `${MARK} EmpA1` })
        .select('unique_id')
        .single()
      expect(error).toBeNull()
      expect(data!.unique_id).toMatch(/^emp[0-9]{8}$/)
    })

    it('is globally unique — two different schools never collide', async () => {
      const a = await ownerA.from('employees').insert({ full_name: `${MARK} EmpA2` }).select('unique_id').single()
      const b = await ownerB.from('employees').insert({ full_name: `${MARK} EmpB1` }).select('unique_id').single()
      expect(a.error).toBeNull()
      expect(b.error).toBeNull()
      expect(a.data!.unique_id).not.toBe(b.data!.unique_id)
    })

    it('is immutable after insert', async () => {
      const { data } = await ownerA.from('employees').insert({ full_name: `${MARK} EmpImmut` }).select('id').single()
      const { error } = await ownerA
        .from('employees')
        .update({ unique_id: 'emp99999999' })
        .eq('id', data!.id)
      expect(error).not.toBeNull()
      expect(error!.message).toContain('unique_id is immutable')
    })
  })

  describe('rfid_card_number', () => {
    it('students: unique per school, not globally — different schools may reuse a card number', async () => {
      const a = await ownerA
        .from('students')
        .insert({ full_name: `${MARK} CardA`, rfid_card_number: 'CARD-564-1' })
        .select('id')
        .single()
      const b = await ownerB
        .from('students')
        .insert({ full_name: `${MARK} CardB`, rfid_card_number: 'CARD-564-1' })
        .select('id')
        .single()
      expect(a.error).toBeNull()
      expect(b.error).toBeNull() // same card_number, different school: allowed
    })

    it('students: rejects a duplicate card number within the same school', async () => {
      await ownerA.from('students').insert({ full_name: `${MARK} CardDup1`, rfid_card_number: 'CARD-564-2' })
      const { error } = await ownerA
        .from('students')
        .insert({ full_name: `${MARK} CardDup2`, rfid_card_number: 'CARD-564-2' })
      expect(error).not.toBeNull()
      expect(error!.code).toBe('23505')
      // The exact substring lib/students.ts's friendlyStudentError (issue
      // #565) matches on — this is what actually proves that check works
      // against real Postgres output, not just a hand-authored mock string.
      expect(error!.message).toContain('students_rfid_card_number_key')
    })

    it('students: null card numbers never collide with each other', async () => {
      const a = await ownerA.from('students').insert({ full_name: `${MARK} NoCard1` }).select('rfid_card_number').single()
      const b = await ownerA.from('students').insert({ full_name: `${MARK} NoCard2` }).select('rfid_card_number').single()
      expect(a.error).toBeNull()
      expect(b.error).toBeNull()
      expect(a.data!.rfid_card_number).toBeNull()
      expect(b.data!.rfid_card_number).toBeNull()
    })

    it('employees: rejects a duplicate card number within the same school', async () => {
      await ownerA.from('employees').insert({ full_name: `${MARK} EmpCard1`, rfid_card_number: 'CARD-564-E1' })
      const { error } = await ownerA
        .from('employees')
        .insert({ full_name: `${MARK} EmpCard2`, rfid_card_number: 'CARD-564-E1' })
      expect(error).not.toBeNull()
      expect(error!.code).toBe('23505')
      // The exact substring lib/employees.ts's friendlyEmployeeError (issue
      // #565) matches on.
      expect(error!.message).toContain('employees_rfid_card_number_key')
    })

    it('employees: a different school may reuse the same card number', async () => {
      const a = await ownerA
        .from('employees')
        .insert({ full_name: `${MARK} EmpCardA`, rfid_card_number: 'CARD-564-E2' })
        .select('id')
        .single()
      const b = await ownerB
        .from('employees')
        .insert({ full_name: `${MARK} EmpCardB`, rfid_card_number: 'CARD-564-E2' })
        .select('id')
        .single()
      expect(a.error).toBeNull()
      expect(b.error).toBeNull()
    })

    it('can be edited after creation (not immutable, unlike unique_id)', async () => {
      const { data } = await ownerA
        .from('students')
        .insert({ full_name: `${MARK} CardEdit` })
        .select('id')
        .single()
      const { error, data: updated } = await ownerA
        .from('students')
        .update({ rfid_card_number: 'CARD-564-3' })
        .eq('id', data!.id)
        .select('rfid_card_number')
        .single()
      expect(error).toBeNull()
      expect(updated!.rfid_card_number).toBe('CARD-564-3')
    })
  })
})
