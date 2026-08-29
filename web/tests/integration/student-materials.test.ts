import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: study material (#447, migration 0141) — two sources, one view, and the
// guarantee that a Student cannot reach another class's material.

const P = 'MT1 '

describe('Student materials (#447)', () => {
  let owner: SupabaseClient
  let student: SupabaseClient

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    student = await signedIn('s9001@test-a.students.invalid')
    await owner.from('publications').delete().like('title', `${P}%`)

    const rows = [
      { kind: 'lesson_plan', title: `${P}Mine`, target_type: 'specific', target_class_name: 'Seed Class', target_section: 'A' },
      { kind: 'exam_prep', title: `${P}Everyone`, target_type: 'all' },
      { kind: 'daily_lesson', title: `${P}Other class`, target_type: 'specific', target_class_name: 'Not My Class', target_section: 'B' },
      // A notice is not study material, even though it is a publication.
      { kind: 'notice', title: `${P}Not material`, target_type: 'all' },
    ]
    for (const r of rows) {
      const { error } = await owner.from('publications').insert({ importance: 'normal', ...r })
      if (error) throw new Error(`${r.title}: ${error.message}`)
    }
  })

  afterAll(async () => {
    await owner.from('publications').delete().like('title', `${P}%`)
  })

  it('shows material for my class and the whole school, and nothing else', async () => {
    const { data, error } = await student.from('student_material').select('title').like('title', `${P}%`)
    expect(error).toBeNull()
    expect((data ?? []).map((r) => r.title).sort()).toEqual([`${P}Everyone`, `${P}Mine`])
  })

  it('does not treat a notice as study material', async () => {
    const { data } = await student.from('student_material').select('title').eq('title', `${P}Not material`)
    expect(data ?? []).toEqual([])
  })

  it('resolves the author without a grant on profiles', async () => {
    const { data } = await student.from('student_material').select('posted_by').eq('title', `${P}Mine`)
    expect(data).toHaveLength(1)

    // A Student reads only their own profiles row — the author name arrives
    // through the view, never from the table.
    const { data: profiles } = await student.from('profiles').select('id, role')
    expect(profiles?.map((p) => p.role)).toEqual(['student'])
  })

  it('exposes a storage path only through the view', async () => {
    // class_syllabi itself stays closed: a Student has no policy on it.
    const { data } = await student.from('class_syllabi').select('storage_path')
    expect(data ?? []).toEqual([])
  })
})
