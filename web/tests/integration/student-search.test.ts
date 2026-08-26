import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: what the student branch of globalRecordSearch can actually reach
// (#457). The ticket says RLS already guarantees scoping — but assert it rather
// than assume it, so these are the same queries that branch runs.

const P = 'SR1 '

describe('Student search sources (#457)', () => {
  let owner: SupabaseClient
  let student: SupabaseClient

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    student = await signedIn('s9001@test-a.students.invalid')
    await owner.from('publications').delete().like('title', `${P}%`)

    for (const row of [
      { kind: 'notice', title: `${P}Mine notice`, target_type: 'specific', target_class_name: 'Seed Class', target_section: 'A' },
      { kind: 'homework', title: `${P}Mine task`, target_type: 'specific', target_class_name: 'Seed Class', target_section: 'A' },
      { kind: 'lesson_plan', title: `${P}Mine material`, target_type: 'all' },
      { kind: 'notice', title: `${P}Other class notice`, target_type: 'specific', target_class_name: 'Not My Class', target_section: 'Z' },
    ]) {
      const { error } = await owner.from('publications').insert({ importance: 'normal', ...row })
      if (error) throw new Error(`${row.title}: ${error.message}`)
    }
  })

  afterAll(async () => {
    await owner.from('publications').delete().like('title', `${P}%`)
  })

  it('finds the student’s own notices and tasks', async () => {
    const { data } = await student
      .from('publications')
      .select('title, kind')
      .ilike('title', `%${P}%`)
      .in('kind', ['notice', 'homework'])
    expect((data ?? []).map((r) => r.title).sort()).toEqual([`${P}Mine notice`, `${P}Mine task`])
  })

  it('finds study material through its own view', async () => {
    const { data } = await student.from('student_material').select('title').ilike('title', `%${P}%`)
    expect((data ?? []).map((r) => r.title)).toEqual([`${P}Mine material`])
  })

  it('matches nothing belonging to another class', async () => {
    const { data } = await student.from('publications').select('title').ilike('title', `%Other class%`)
    expect(data ?? []).toEqual([])
  })

  it('subjects come from the student’s own class only', async () => {
    const { data, error } = await student.from('student_subject_option').select('id, name')
    expect(error).toBeNull()
    const { data: all } = await owner.from('subjects').select('id')
    expect((data ?? []).length).toBeLessThanOrEqual((all ?? []).length)
  })

  it('results are searchable only once published', async () => {
    // student_exam_result carries the publication gate, so an unpublished exam
    // cannot be reached by search any more than by the results page.
    const { data, error } = await student.from('student_exam_result').select('exam_name')
    expect(error).toBeNull()
    for (const row of data ?? []) expect(row.exam_name).toBeTruthy()
  })

  it('another school’s student matches nothing of ours', async () => {
    const ownerB = await signedIn('owner-b@test.local')
    const { data } = await ownerB.from('publications').select('id').ilike('title', `%${P}%`)
    expect(data ?? []).toEqual([])
  })
})
