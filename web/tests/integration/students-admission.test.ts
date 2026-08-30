import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: Students I schema (issue #27, PRD §5.1 first half) — full admission
// profile columns, assign_student_roll trigger (auto-roll per
// School+class+section, stepped by schools.roll_number_increment — issue
// #503), soft-archive via archived_at, student_transfers history, all
// RLS-scoped.

describe('Students I (issue #27)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let studentId: string

  async function cleanup() {
    await ownerA.from('students').delete().like('full_name', 'ST1 %')
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    await cleanup()

    const { data, error } = await ownerA
      .from('students')
      .insert({
        full_name: 'ST1 Rakib',
        class_name: 'ST1 Class',
        section: 'A',
        gender: 'male',
        village: 'Basail',
        district: 'Tangail',
        guardian_name: 'ST1 Guardian',
        guardian_relation: 'father',
        guardian_mobile: '01700000000',
        is_freedom_fighter_child: true,
        previous_institute: 'ST1 Primary',
        sibling_info: 'ST1 Sibling, roll 12',
        // Leading zero on purpose (issue #565) — text, not numeric, so it
        // must round-trip exactly rather than being coerced to 54321. A
        // value this test file hasn't used anywhere else (unlike full_name,
        // rfid_card_number isn't scoped by cleanup()'s 'ST1 %' pattern, so a
        // reused literal can collide with any other row on this shared
        // project that happens to carry the same card number).
        rfid_card_number: 'ST1-CARD-00054321',
      })
      .select('id, roll_number, is_freedom_fighter_child')
      .single()
    if (error) throw new Error(error.message)
    studentId = data.id
  })

  afterAll(cleanup)

  it('admission stores the full profile and auto-assigns roll 1', async () => {
    const { data } = await ownerA
      .from('students')
      .select('roll_number, guardian_name, is_freedom_fighter_child, village, rfid_card_number')
      .eq('id', studentId)
      .single()
    expect(data?.roll_number).toBe(1)
    expect(data?.guardian_name).toBe('ST1 Guardian')
    expect(data?.is_freedom_fighter_child).toBe(true)
    expect(data?.village).toBe('Basail')
    expect(data?.rfid_card_number).toBe('ST1-CARD-00054321')
  })

  it('the next admission in the same class gets the next roll', async () => {
    const { data } = await ownerA
      .from('students')
      .insert({ full_name: 'ST1 Tamim', class_name: 'ST1 Class', section: 'A' })
      .select('roll_number')
      .single()
    expect(data?.roll_number).toBe(2)
  })

  it('a different class starts its own roll sequence', async () => {
    const { data } = await ownerA
      .from('students')
      .insert({ full_name: 'ST1 Sadia', class_name: 'ST1 Other Class' })
      .select('roll_number')
      .single()
    expect(data?.roll_number).toBe(1)
  })

  // Section-scoped rolls (issue #503, docs/012): Section A being up to roll 5
  // must not push Section B's first admission past roll 1.
  it('a different section within the same class starts its own roll sequence', async () => {
    await ownerA
      .from('students')
      .insert({ full_name: 'ST1 Section A2', class_name: 'ST1 Section Class', section: 'A' })
    const { data } = await ownerA
      .from('students')
      .insert({ full_name: 'ST1 Section B1', class_name: 'ST1 Section Class', section: 'B' })
      .select('roll_number')
      .single()
    expect(data?.roll_number).toBe(1)
  })

  it('the school roll increment steps auto-assigned rolls', async () => {
    const { data: userA } = await ownerA.auth.getUser()
    const { data: profile } = await ownerA
      .from('profiles')
      .select('school_id')
      .eq('id', userA.user!.id)
      .single()
    const schoolId = profile!.school_id
    // finally, so a failed assertion below still restores the shared school's
    // increment — otherwise every later test in this file that assumes the
    // default of 1 would fail too, masking whatever this test actually caught.
    await ownerA.from('schools').update({ roll_number_increment: 2 }).eq('id', schoolId)
    try {
      const first = await ownerA
        .from('students')
        .insert({ full_name: 'ST1 Increment 1', class_name: 'ST1 Increment Class' })
        .select('roll_number')
        .single()
      const second = await ownerA
        .from('students')
        .insert({ full_name: 'ST1 Increment 2', class_name: 'ST1 Increment Class' })
        .select('roll_number')
        .single()
      expect(first.data?.roll_number).toBe(2)
      expect(second.data?.roll_number).toBe(4)
    } finally {
      await ownerA.from('schools').update({ roll_number_increment: 1 }).eq('id', schoolId)
    }
  })

  it('an explicit roll is kept as-is', async () => {
    const { data } = await ownerA
      .from('students')
      .insert({ full_name: 'ST1 Explicit', class_name: 'ST1 Class', roll_number: 50 })
      .select('roll_number')
      .single()
    expect(data?.roll_number).toBe(50)
  })

  it('concurrent admissions to one class get distinct rolls (advisory lock)', async () => {
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) =>
        ownerA
          .from('students')
          .insert({ full_name: `ST1 Concurrent ${n}`, class_name: 'ST1 Race Class' })
          .select('roll_number')
          .single(),
      ),
    )
    const rolls = results.map((r) => r.data?.roll_number)
    expect(new Set(rolls).size).toBe(4)
  })

  it('an explicit duplicate roll in a class is rejected (unique backstop)', async () => {
    await ownerA
      .from('students')
      .insert({ full_name: 'ST1 Dup A', class_name: 'ST1 Dup Class', roll_number: 7 })
    const { error } = await ownerA
      .from('students')
      .insert({ full_name: 'ST1 Dup B', class_name: 'ST1 Dup Class', roll_number: 7 })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505')
  })

  it('soft-archive keeps the row but flags it', async () => {
    const { error } = await ownerA
      .from('students')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', studentId)
    expect(error).toBeNull()
    const { data: archived } = await ownerA
      .from('students')
      .select('id')
      .not('archived_at', 'is', null)
      .eq('id', studentId)
    expect(archived).toHaveLength(1)
    // restore
    await ownerA.from('students').update({ archived_at: null }).eq('id', studentId)
    const { data: active } = await ownerA
      .from('students')
      .select('archived_at')
      .eq('id', studentId)
      .single()
    expect(active?.archived_at).toBeNull()
  })

  it('transfer_student RPC records history and moves the student atomically', async () => {
    const { error } = await ownerA.rpc('transfer_student', {
      p_student_id: studentId,
      p_to_class: 'ST1 Other Class',
      p_to_section: 'B',
      p_note: 'guardian request',
    })
    expect(error).toBeNull()
    const { data: history } = await ownerA
      .from('student_transfers')
      .select('to_class, note')
      .eq('student_id', studentId)
    expect(history).toHaveLength(1)
    expect(history![0].to_class).toBe('ST1 Other Class')
    const { data: student } = await ownerA
      .from('students')
      .select('class_name, section, roll_number')
      .eq('id', studentId)
      .single()
    expect(student?.class_name).toBe('ST1 Other Class')
    expect(student?.section).toBe('B')
    expect(student?.roll_number).toBeNull() // reset on class change
  })

  it('transfer_student resets the roll on a section-only move (roll is section-scoped)', async () => {
    const { data: created } = await ownerA
      .from('students')
      .insert({ full_name: 'ST1 SectionMove', class_name: 'ST1 Other Class', section: 'B' })
      .select('id, roll_number')
      .single()
    expect(created?.roll_number).not.toBeNull()

    const { error } = await ownerA.rpc('transfer_student', {
      p_student_id: created!.id,
      p_to_class: 'ST1 Other Class', // same class
      p_to_section: 'C', // section-only change
      p_note: 'section move',
    })
    expect(error).toBeNull()
    const { data: moved } = await ownerA
      .from('students')
      .select('section, roll_number')
      .eq('id', created!.id)
      .single()
    expect(moved?.section).toBe('C')
    expect(moved?.roll_number).toBeNull()
  })

  it('transfer_student rejects a student from another school', async () => {
    const { error } = await ownerB.rpc('transfer_student', {
      p_student_id: studentId,
      p_to_class: 'Hijack',
      p_to_section: null,
      p_note: null,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('student not accessible')
  })

  it("RLS: another school's owner sees neither student nor transfers", async () => {
    const { data: students } = await ownerB.from('students').select('id').eq('id', studentId)
    expect(students).toHaveLength(0)
    const { data: transfers } = await ownerB
      .from('student_transfers')
      .select('id')
      .eq('student_id', studentId)
    expect(transfers).toHaveLength(0)
  })

  it("another school's owner cannot plant a transfer row for the student (tenancy trigger)", async () => {
    const { error } = await ownerB.from('student_transfers').insert({
      student_id: studentId,
      to_class: 'Hijack',
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('student does not belong to this school')
  })
})
