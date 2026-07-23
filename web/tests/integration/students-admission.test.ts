import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: Students I schema (issue #27, PRD §5.1 first half) — full admission
// profile columns, assign_student_roll trigger (auto-roll per School+class),
// soft-archive via archived_at, student_transfers history, all RLS-scoped.

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
      .select('roll_number, guardian_name, is_freedom_fighter_child, village')
      .eq('id', studentId)
      .single()
    expect(data?.roll_number).toBe(1)
    expect(data?.guardian_name).toBe('ST1 Guardian')
    expect(data?.is_freedom_fighter_child).toBe(true)
    expect(data?.village).toBe('Basail')
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
