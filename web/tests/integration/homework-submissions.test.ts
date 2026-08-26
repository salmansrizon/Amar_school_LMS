import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: homework submission (#448, migration 0142).
//
// The ticket names two defects earlier tickets learned the hard way, so both
// are pinned here: the caps are enforced server-side (not just in the UI), and
// the tenancy boundary cannot be crossed by supplying somebody else's ids.

const P = 'SB1 '

describe('Homework submissions (#448)', () => {
  let owner: SupabaseClient
  let ownerB: SupabaseClient
  let student: SupabaseClient
  let studentId: string
  let schoolId: string
  let taskId: string

  const file = (n: number, size = 1024) => ({
    school_id: schoolId,
    publication_id: taskId,
    student_id: studentId,
    storage_path: `${schoolId}/${studentId}/${taskId}/${n}.jpg`,
    file_name: `page-${n}.jpg`,
    file_size: size,
  })

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    student = await signedIn('s9001@test-a.students.invalid')

    const self = (await student.from('student_self').select('id, school_id').single()).data!
    studentId = self.id
    schoolId = self.school_id

    await owner.from('publications').delete().like('title', `${P}%`)
    const { data, error } = await owner
      .from('publications')
      .insert({
        kind: 'homework',
        title: `${P}Essay`,
        importance: 'normal',
        target_type: 'specific',
        target_class_name: 'Seed Class',
        target_section: 'A',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    taskId = data.id
  })

  afterAll(async () => {
    await owner.from('publications').delete().like('title', `${P}%`)
  })

  it('a student submits their own work', async () => {
    const { error } = await student.from('homework_submissions').insert(file(1))
    expect(error).toBeNull()
  })

  it('refuses a file over the size ceiling — server-side, not just in the UI', async () => {
    const { error } = await student.from('homework_submissions').insert(file(99, 5242881))
    expect(error?.message).toContain('submission limit')
  })

  it('refuses more than the per-task file count', async () => {
    for (const n of [2, 3, 4, 5]) {
      const { error } = await student.from('homework_submissions').insert(file(n))
      expect(error, `file ${n} should be accepted`).toBeNull()
    }
    const { error } = await student.from('homework_submissions').insert(file(6))
    expect(error?.message).toContain('maximum')
  })

  it('refuses a submission claiming to be another student', async () => {
    const { error } = await student.from('homework_submissions').insert({
      ...file(7),
      student_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(error).not.toBeNull()
  })

  it('refuses a submission stamped with another school', async () => {
    const { data: schoolB } = await ownerB.from('schools').select('id').single()
    const { error } = await student
      .from('homework_submissions')
      .insert({ ...file(8), school_id: schoolB!.id })
    expect(error).not.toBeNull()
  })

  it('the teacher reviews it, and the student can no longer withdraw it', async () => {
    const { data: rows } = await student
      .from('homework_submissions')
      .select('id')
      .eq('publication_id', taskId)
      .limit(1)
    const id = rows![0].id

    const review = await owner
      .from('homework_submissions')
      .update({ marks: 8, teacher_comment: 'Neat work', reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
    expect(review.error).toBeNull()
    expect(review.data).toHaveLength(1)

    // RLS scopes the delete to unreviewed rows, so this removes nothing.
    const withdrawn = await student.from('homework_submissions').delete().eq('id', id).select('id')
    expect(withdrawn.data ?? []).toEqual([])
  })

  it('a student cannot mark their own work', async () => {
    const { data: rows } = await student
      .from('homework_submissions')
      .select('id')
      .eq('publication_id', taskId)
      .limit(1)
    // No UPDATE policy for students at all: the review columns live on the same
    // row, so an update grant would let a student write their own marks.
    const { data } = await student
      .from('homework_submissions')
      .update({ marks: 100 })
      .eq('id', rows![0].id)
      .select('id')
    expect(data ?? []).toEqual([])
  })

  it('another school sees no submissions', async () => {
    const { data } = await ownerB
      .from('homework_submissions')
      .select('id')
      .eq('publication_id', taskId)
    expect(data ?? []).toEqual([])
  })
})
