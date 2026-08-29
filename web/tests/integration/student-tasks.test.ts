import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: homework completion (#446, migration 0140).
//
// The guarantee that matters: a tick is the Student's own claim. They can make
// it and take it back; staff can see it but must never be able to make it for
// them, because the row's entire meaning is that the Student said so.

const P = 'TK1 '

describe('Student tasks (#446)', () => {
  let owner: SupabaseClient
  let student: SupabaseClient
  let studentId: string
  let taskId: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    student = await signedIn('s9001@test-a.students.invalid')
    studentId = (await student.from('student_self').select('id').single()).data!.id

    await owner.from('publications').delete().like('title', `${P}%`)
    const { data, error } = await owner
      .from('publications')
      .insert({
        kind: 'homework',
        title: `${P}Algebra exercises 4-9`,
        importance: 'normal',
        target_type: 'specific',
        target_class_name: 'Seed Class',
        target_section: 'A',
        due_at: '2099-01-15T00:00:00Z',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    taskId = data.id
  })

  afterAll(async () => {
    await owner.from('publications').delete().like('title', `${P}%`)
  })

  it('the task reaches the student, with its due date', async () => {
    const { data } = await student
      .from('publications')
      .select('id, due_at')
      .eq('kind', 'homework')
      .eq('id', taskId)
    expect(data).toHaveLength(1)
    expect(data![0].due_at).toContain('2099-01-15')
  })

  it('the student ticks it off and can take the tick back', async () => {
    const on = await student
      .from('student_task_completions')
      .insert({ publication_id: taskId, student_id: studentId })
    expect(on.error).toBeNull()

    const { data: after } = await student
      .from('student_task_completions')
      .select('publication_id')
      .eq('publication_id', taskId)
    expect(after).toHaveLength(1)

    // Reversible, unlike a read receipt — a tick made by mistake must be undoable.
    await student.from('student_task_completions').delete().eq('publication_id', taskId)
    const { data: cleared } = await student
      .from('student_task_completions')
      .select('publication_id')
      .eq('publication_id', taskId)
    expect(cleared ?? []).toEqual([])
  })

  it('the student cannot tick a task off for somebody else', async () => {
    const { error } = await student.from('student_task_completions').insert({
      publication_id: taskId,
      student_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(error).not.toBeNull()
  })

  it('staff see the roster but cannot tick on a student’s behalf', async () => {
    await student
      .from('student_task_completions')
      .insert({ publication_id: taskId, student_id: studentId })

    const { data: roster, error } = await owner
      .from('task_completion_roster')
      .select('student_id, full_name, completed_at')
      .eq('publication_id', taskId)
    expect(error).toBeNull()
    // Every targeted student appears, ticked or not — that is the point of the view.
    expect(roster!.length).toBeGreaterThan(0)
    expect(roster!.find((r) => r.student_id === studentId)?.completed_at).not.toBeNull()

    const forged = await owner.from('student_task_completions').insert({
      publication_id: taskId,
      student_id: studentId,
      completed_at: new Date().toISOString(),
    })
    expect(forged.error).not.toBeNull()

    await student.from('student_task_completions').delete().eq('publication_id', taskId)
  })

  it('another school’s owner sees none of the roster', async () => {
    const ownerB = await signedIn('owner-b@test.local')
    const { data } = await ownerB
      .from('task_completion_roster')
      .select('student_id')
      .eq('publication_id', taskId)
    expect(data ?? []).toEqual([])
  })
})
