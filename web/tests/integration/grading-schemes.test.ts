import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: Exams I — grading schemes & pass rules (issue #31, PRD §5.5).
// grading_schemes (school-scoped, letter/numeric/grade_point) + grade_bands
// (percent-range -> label/grade-point table), with a same-school tenancy
// trigger on grade_bands mirroring student_subjects/class_routines.

describe('Grading schemes & grade bands (issue #31)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let schemeId: string
  let foreignSchemeId: string

  async function cleanup(client: SupabaseClient) {
    await client.from('grading_schemes').delete().like('name', 'GS Test%')
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    await cleanup(ownerA)
    await cleanup(ownerB)
  })

  afterAll(async () => {
    await cleanup(ownerA)
    await cleanup(ownerB)
  })

  it('a school owner creates a grade_point grading scheme with defaults', async () => {
    const { data, error } = await ownerA
      .from('grading_schemes')
      .insert({ name: 'GS Test Scheme', scheme_type: 'grade_point' })
      .select('id, pass_mark_percent, pass_rule_strategy, combine_subject_groups')
      .single()
    expect(error).toBeNull()
    expect(data!.pass_mark_percent).toBe(33)
    expect(data!.pass_rule_strategy).toBe('individual')
    expect(data!.combine_subject_groups).toBe(false)
    schemeId = data!.id
  })

  it('rejects an unknown scheme_type', async () => {
    const { error } = await ownerA.from('grading_schemes').insert({ name: 'GS Test Bad', scheme_type: 'nonsense' })
    expect(error).not.toBeNull()
  })

  it('the same school cannot create two schemes with the same name', async () => {
    const { error } = await ownerA.from('grading_schemes').insert({ name: 'GS Test Scheme', scheme_type: 'letter' })
    expect(error).not.toBeNull()
  })

  it('adds grade bands under the scheme', async () => {
    const { error: e1 } = await ownerA
      .from('grade_bands')
      .insert({ grading_scheme_id: schemeId, label: 'A+', min_percent: 80, max_percent: 100, grade_point: 5 })
    expect(e1).toBeNull()
    const { error: e2 } = await ownerA
      .from('grade_bands')
      .insert({ grading_scheme_id: schemeId, label: 'F', min_percent: 0, max_percent: 32.99, grade_point: 0 })
    expect(e2).toBeNull()

    const { data } = await ownerA.from('grade_bands').select('label').eq('grading_scheme_id', schemeId)
    expect(data).toHaveLength(2)
  })

  it('rejects a max_percent below min_percent', async () => {
    const { error } = await ownerA
      .from('grade_bands')
      .insert({ grading_scheme_id: schemeId, label: 'Bad', min_percent: 50, max_percent: 40 })
    expect(error).not.toBeNull()
  })

  it("a band cannot reference another school's scheme (tenancy trigger)", async () => {
    const { data: foreign } = await ownerB
      .from('grading_schemes')
      .insert({ name: 'GS Test Foreign', scheme_type: 'letter' })
      .select('id')
      .single()
    foreignSchemeId = foreign!.id
    const { error } = await ownerA
      .from('grade_bands')
      .insert({ grading_scheme_id: foreignSchemeId, label: 'X', min_percent: 0, max_percent: 100 })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('grading scheme does not belong to this school')
  })

  it("RLS: another school's owner sees none of this school's schemes or bands", async () => {
    const { data: schemes } = await ownerB.from('grading_schemes').select('id').eq('id', schemeId)
    expect(schemes).toHaveLength(0)
    const { data: bands } = await ownerB.from('grade_bands').select('id').eq('grading_scheme_id', schemeId)
    expect(bands).toHaveLength(0)
  })

  it('deleting a scheme cascades to its grade bands', async () => {
    const { error } = await ownerA.from('grading_schemes').delete().eq('id', schemeId)
    expect(error).toBeNull()
    const { data } = await ownerA.from('grade_bands').select('id').eq('grading_scheme_id', schemeId)
    expect(data).toHaveLength(0)
  })
})
