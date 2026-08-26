import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: questions to the Class Teacher (#454, migration 0148).
//
// One question, one reply. The anchor is mandatory — it is what makes the
// teacher's inbox groupable — and the Student must never be able to write the
// reply or mark their own question answered.

const P = 'QN1 '

describe('Student questions (#454)', () => {
  let owner: SupabaseClient
  let ownerB: SupabaseClient
  let student: SupabaseClient
  let studentId: string
  let schoolId: string
  let publicationId: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    student = await signedIn('s9001@test-a.students.invalid')
    const self = (await student.from('student_self').select('id, school_id').single()).data!
    studentId = self.id
    schoolId = self.school_id

    await owner.from('publications').delete().like('title', `${P}%`)
    const pub = await owner
      .from('publications')
      .insert({
        kind: 'homework',
        title: `${P}Chapter 4`,
        importance: 'normal',
        target_type: 'specific',
        target_class_name: 'Seed Class',
        target_section: 'A',
      })
      .select('id')
      .single()
    if (pub.error) throw new Error(pub.error.message)
    publicationId = pub.data.id
  })

  afterAll(async () => {
    await owner.from('student_messages').delete().eq('student_id', studentId)
    await owner.from('publications').delete().like('title', `${P}%`)
  })

  it('a student asks a question anchored to a post', async () => {
    const { error } = await student.from('student_messages').insert({
      school_id: schoolId,
      student_id: studentId,
      publication_id: publicationId,
      subject: `${P}Question 3`,
      body: 'I do not understand the second part.',
    })
    expect(error).toBeNull()
  })

  it('refuses a question anchored to neither a post nor a subject', async () => {
    // The teacher's inbox would have nowhere to file it.
    const { error } = await student.from('student_messages').insert({
      school_id: schoolId,
      student_id: studentId,
      subject: 'Floating',
      body: 'no anchor',
    })
    expect(error).not.toBeNull()
  })

  it('refuses a question that arrives pre-answered', async () => {
    const { error } = await student.from('student_messages').insert({
      school_id: schoolId,
      student_id: studentId,
      publication_id: publicationId,
      subject: 'Forged',
      body: 'x',
      reply_body: 'I answered myself',
      status: 'answered',
    })
    expect(error).not.toBeNull()
  })

  it('refuses a question sent as another student', async () => {
    const { error } = await student.from('student_messages').insert({
      school_id: schoolId,
      student_id: '00000000-0000-0000-0000-000000000000',
      publication_id: publicationId,
      subject: 'Impersonation',
      body: 'x',
    })
    expect(error).not.toBeNull()
  })

  it('the student cannot write the reply afterwards either', async () => {
    const { data: mine } = await student.from('student_messages').select('id').limit(1)
    const { data } = await student
      .from('student_messages')
      .update({ reply_body: 'I answered myself', status: 'answered' })
      .eq('id', mine![0].id)
      .select('id')
    expect(data ?? []).toEqual([])
  })

  it('the school sees it grouped under the post it was asked about', async () => {
    const { data, error } = await owner
      .from('student_message_inbox')
      .select('topic_key, topic_label, student_name, publication_kind')
      .eq('publication_id', publicationId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].topic_key).toBe(publicationId)
    expect(data![0].topic_label).toBe(`${P}Chapter 4`)
    expect(data![0].publication_kind).toBe('homework')
  })

  it('the teacher replies, and the student reads it', async () => {
    const { data: mine } = await student.from('student_messages').select('id').limit(1)
    const reply = await owner
      .from('student_messages')
      .update({ reply_body: 'Read the worked example first.', status: 'answered' })
      .eq('id', mine![0].id)
      .select('id')
    expect(reply.error).toBeNull()

    const { data } = await student
      .from('student_messages')
      .select('reply_body, status')
      .eq('id', mine![0].id)
    expect(data).toEqual([{ reply_body: 'Read the worked example first.', status: 'answered' }])
  })

  it('another school sees none of it', async () => {
    const { data } = await ownerB.from('student_message_inbox').select('id').eq('publication_id', publicationId)
    expect(data ?? []).toEqual([])
  })
})
