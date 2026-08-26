import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: the Student's fee view (#453, migration 0147), bound by ADR 0015.
//
// The guarantee: paid, fine and due are visible; the adjustment is not merely
// unselected but ABSENT, and fee_structures stays shut so the waiver cannot be
// recovered by subtracting the bill from the list price.

describe('Student fees (#453)', () => {
  let owner: SupabaseClient
  let student: SupabaseClient
  let studentId: string
  let recordId: string | null = null

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    student = await signedIn('s9001@test-a.students.invalid')
    studentId = (await student.from('student_self').select('id').single()).data!.id

    await owner.from('fee_collection_records').delete().eq('student_id', studentId).eq('year', 2098)
    const { data, error } = await owner
      .from('fee_collection_records')
      .insert({
        student_id: studentId,
        month: 5,
        year: 2098,
        pay_amount: 1000,
        fine_amount: 50,
        adjust_amount: 2000,
        due_amount: 300,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    recordId = data.id
  })

  afterAll(async () => {
    if (recordId) await owner.from('fee_collection_records').delete().eq('id', recordId)
  })

  it('shows the student paid, fine and due', async () => {
    const { data, error } = await student
      .from('student_fee_record')
      .select('month, year, pay_amount, fine_amount, due_amount')
      .eq('year', 2098)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    // numeric(12,2) arrives as a string over PostgREST; compare as numbers.
    expect({
      month: data![0].month,
      year: data![0].year,
      paid: Number(data![0].pay_amount),
      fine: Number(data![0].fine_amount),
      due: Number(data![0].due_amount),
    }).toEqual({ month: 5, year: 2098, paid: 1000, fine: 50, due: 300 })
  })

  it('the adjustment is absent from the surface, not merely unselected', async () => {
    // ADR 0015: adjust_amount conflates a scholarship with a hardship waiver,
    // and nothing distinguishes them. The column cannot be named.
    const { error } = await student.from('student_fee_record').select('adjust_amount')
    expect(error).not.toBeNull()
  })

  it('the base table stays shut', async () => {
    const { data } = await student.from('fee_collection_records').select('adjust_amount')
    expect(data ?? []).toEqual([])
  })

  it('fee_structures stays shut — otherwise the waiver is recoverable by subtraction', async () => {
    // The constraint ADR 0015 names as what makes the whole decision hold.
    const { data } = await student.from('fee_structures').select('id')
    expect(data ?? []).toEqual([])
  })

  it('another student’s fees are not visible', async () => {
    const { data } = await student.from('student_fee_record').select('id')
    const { data: all } = await owner.from('fee_collection_records').select('id')
    expect((data ?? []).length).toBeLessThan((all ?? []).length)
  })
})
