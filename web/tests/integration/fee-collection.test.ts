import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: fee_collection_records schema — the one-record-per-student-per-month
// invariant, edit-in-place semantics, identity pinning (issue #11).

describe('Fee Collection Record (issue #11)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let studentId: string
  let recordId: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    await ownerA.from('students').delete().eq('full_name', 'Fee Test Student')
    const { data, error } = await ownerA
      .from('students')
      .insert({ full_name: 'Fee Test Student', class_name: 'Six' })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    studentId = data.id
  })

  afterAll(async () => {
    await ownerA.from('students').delete().eq('id', studentId)
  })

  it('a Fee Collection Record can be created for a Student for a month', async () => {
    const { data, error } = await ownerA
      .from('fee_collection_records')
      .insert({ student_id: studentId, month: 7, year: 2026, pay_amount: 500, due_amount: 100 })
      .select('id, school_id')
      .single()
    expect(error).toBeNull()
    expect(data!.school_id).not.toBeNull()
    recordId = data!.id
  })

  it('a second record for the same Student+month is rejected by the DB', async () => {
    const { error } = await ownerA
      .from('fee_collection_records')
      .insert({ student_id: studentId, month: 7, year: 2026, pay_amount: 200 })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/duplicate|unique/i)
  })

  it('a second payment edits the SAME record’s cumulative totals in place', async () => {
    const { error } = await ownerA
      .from('fee_collection_records')
      .update({ pay_amount: 700, due_amount: 0 })
      .eq('id', recordId)
    expect(error).toBeNull()

    const { data: all } = await ownerA
      .from('fee_collection_records')
      .select('id, pay_amount')
      .eq('student_id', studentId)
      .eq('month', 7)
      .eq('year', 2026)
    expect(all).toHaveLength(1) // no history line was appended
    expect(Number(all![0].pay_amount)).toBe(700)
  })

  it('the record is pinned to its Student and month — identity cannot be rewritten', async () => {
    await ownerA
      .from('fee_collection_records')
      .update({ month: 8 })
      .eq('id', recordId)
    const { data } = await ownerA
      .from('fee_collection_records')
      .select('month')
      .eq('id', recordId)
      .single()
    expect(data!.month).toBe(7)
  })

  it('a different month for the same Student is a separate record', async () => {
    const { error } = await ownerA
      .from('fee_collection_records')
      .insert({ student_id: studentId, month: 8, year: 2026, pay_amount: 500 })
    expect(error).toBeNull()
  })

  it("another School's Owner sees none of these records", async () => {
    const { data } = await ownerB
      .from('fee_collection_records')
      .select('id')
      .eq('student_id', studentId)
    expect(data).toEqual([])
  })
})
