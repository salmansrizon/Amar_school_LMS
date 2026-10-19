import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { offeringRolls, rollAlreadyTaken, rollTakenInOffering, type OfferingRoll } from '@/lib/school/roll-check'

// #690: one roll per Class Offering, across both copies of the roll.
const rows: OfferingRoll[] = [
  { student_id: 'a', enrollment_roll: 1, student_roll: 1 },
  // Drift: edited on the form, so the two copies disagree.
  { student_id: 'b', enrollment_roll: 2, student_roll: 9001 },
  { student_id: 'c', enrollment_roll: 3, student_roll: null },
]

describe('roll check (#690)', () => {
  it('a roll held in either copy is taken', () => {
    expect(rollTakenInOffering(rows, 1)).toBe(true)
    expect(rollTakenInOffering(rows, 9001)).toBe(true) // shown copy only
    expect(rollTakenInOffering(rows, 2)).toBe(true) // enrollment copy only
    expect(rollTakenInOffering(rows, 3)).toBe(true)
  })

  it('a free roll is free, and an empty class has none taken', () => {
    expect(rollTakenInOffering(rows, 4)).toBe(false)
    expect(rollTakenInOffering([], 1)).toBe(false)
  })

  it("the Student being edited does not collide with their own roll", () => {
    expect(rollTakenInOffering(rows, 9001, 'b')).toBe(false)
    expect(rollTakenInOffering(rows, 2, 'b')).toBe(false)
    expect(rollTakenInOffering(rows, 1, 'b')).toBe(true)
  })

  function client(enrollments: { data: unknown; error: unknown }, students: { data: unknown; error: unknown }) {
    const table = (result: { data: unknown; error: unknown }) => {
      const q: Record<string, unknown> = { then: (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok) }
      for (const m of ['select', 'eq', 'is', 'in']) q[m] = () => q
      return q
    }
    return { from: (t: string) => table(t === 'student_enrollments' ? enrollments : students) } as unknown as SupabaseClient
  }
  const enrollments = [
    { id: 'e1', student_id: 'a', roll_number: 1 },
    { id: 'e2', student_id: 'b', roll_number: 2 },
  ]
  const students = [
    { id: 'a', roll_number: 1, current_enrollment_id: 'e1' },
    { id: 'b', roll_number: 9001, current_enrollment_id: 'e2' },
  ]

  it('reads both copies for the Offering', async () => {
    expect(await offeringRolls(client({ data: enrollments, error: null }, { data: students, error: null }), 'o')).toEqual([
      { student_id: 'a', enrollment_roll: 1, student_roll: 1 },
      { student_id: 'b', enrollment_roll: 2, student_roll: 9001 },
    ])
    expect(await offeringRolls(client({ data: [], error: null }, { data: [], error: null }), 'o')).toEqual([])
  })

  it('a read failure skips the pre-check instead of blocking the save', async () => {
    const failed = { data: null, error: { message: 'x' } }
    expect(await offeringRolls(client(failed, { data: [], error: null }), 'o')).toBeNull()
    expect(await rollAlreadyTaken(client(failed, { data: [], error: null }), 'o', 1)).toBe(false)
    expect(await rollAlreadyTaken(client({ data: enrollments, error: null }, failed), 'o', 1)).toBe(false)
  })

  it('answers taken / free end to end', async () => {
    const ok = client({ data: enrollments, error: null }, { data: students, error: null })
    expect(await rollAlreadyTaken(ok, 'o', 9001)).toBe(true)
    expect(await rollAlreadyTaken(ok, 'o', 9001, 'b')).toBe(false)
    expect(await rollAlreadyTaken(ok, 'o', 7)).toBe(false)
  })
})
