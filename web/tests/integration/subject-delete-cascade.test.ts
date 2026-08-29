import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Migration 0172 / issue #548. A subject could not be deleted once any student
// had asked about it: the FK nulled the anchor, student_message_has_anchor
// (ADR 0018) refused the null, and the delete raised.
const TAG = 'ZZ548'

describe('a subject deletes with its questions (#548)', () => {
  let owner: SupabaseClient
  let student: SupabaseClient
  let classId: string
  let studentId: string
  let schoolId: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    student = await signedIn('s9001@test-a.students.invalid')
    // A real session, or "the row is gone" passes for the wrong reason (#542).
    expect((await owner.auth.getUser()).data.user).not.toBeNull()
    classId = (await owner.from('classes').select('id').eq('name', 'Seed Class').single()).data!.id
    const self = (await student.from('student_self').select('id, school_id').single()).data!
    studentId = self.id
    schoolId = self.school_id
    await owner.from('subjects').delete().like('name', `${TAG}%`)
  })

  afterAll(async () => {
    const { data } = await owner.from('subjects').delete().like('name', `${TAG}%`).select('id')
    // The teardown is the feature: before 0172 this delete could not work.
    expect(data ?? []).toHaveLength(0)
  })

  it('deletes a subject nobody has asked about', async () => {
    const subject = await owner
      .from('subjects')
      .insert({ name: `${TAG} Quiet`, class_id: classId, theory_marks: 100 })
      .select('id')
      .single()
    expect(subject.error).toBeNull()

    const { data, error } = await owner.from('subjects').delete().eq('id', subject.data!.id).select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('deletes a subject a student HAS asked about, and the question goes with it', async () => {
    const subject = await owner
      .from('subjects')
      .insert({ name: `${TAG} Asked`, class_id: classId, theory_marks: 100 })
      .select('id')
      .single()
    expect(subject.error).toBeNull()
    const subjectId = subject.data!.id

    // school_id and status are pinned by the insert policy — a student may only
    // file an unread, unanswered question in their own school, as themselves.
    const asked = await student
      .from('student_messages')
      .insert({
        student_id: studentId,
        school_id: schoolId,
        subject_id: subjectId,
        subject: `${TAG} question`,
        body: 'anchored to a subject',
        status: 'unread',
      })
      .select('id')
      .single()
    expect(asked.error).toBeNull()

    const { data, error } = await owner.from('subjects').delete().eq('id', subjectId).select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    // The question is gone rather than orphaned: an anchor-less message cannot
    // be authorised for a reply (ADR 0018), so leaving it would be leaving a
    // question nobody is ever allowed to answer.
    const { data: left } = await student.from('student_messages').select('id').eq('id', asked.data!.id)
    expect(left).toEqual([])
  })
})
