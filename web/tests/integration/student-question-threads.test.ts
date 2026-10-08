import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { seedClassYear } from '../helpers/seed'

// Written for migrations 0253-0257 (#703 items 5.4, 5.6, 5.2, 5.5, 5.8) —
// NOT RUN (the integration suite writes to the shared database). Needs all
// five applied.
//
// Seam: what a Student may and may not do with threads, further replies, seen
// marks, long bodies and withdrawing a question. Everything hangs off one
// homework post, so deleting the post (cascade) cleans up the questions.

const P = 'M0253 '

describe('Student question threads, replies, reads, length, withdraw (0253-0257)', () => {
  let owner: SupabaseClient
  let admin: SupabaseClient
  let student: SupabaseClient
  let studentId: string
  let schoolId: string
  let publicationId: string
  let otherStudentId: string
  let otherMessageId: string
  let rootId: string

  const ask = (fields: Record<string, unknown>) =>
    student
      .from('student_messages')
      .insert({ school_id: schoolId, student_id: studentId, publication_id: publicationId, subject: `${P}q`, body: 'b', ...fields })

  async function cleanup() {
    await owner.from('publications').delete().like('title', `${P}%`) // questions cascade
    await owner.from('students').delete().like('full_name', `${P}%`)
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    admin = await signedIn('super@test.local')
    student = await signedIn('s9001@test-a.students.invalid')
    const seedYear = await seedClassYear(owner)
    const self = (await student.from('student_self').select('id, school_id').single()).data!
    studentId = self.id
    schoolId = self.school_id
    await cleanup()

    const pub = await owner
      .from('publications')
      .insert({
        kind: 'homework',
        title: `${P}Chapter 4`,
        importance: 'normal',
        target_scope: 'broadcast',
        target_class_name: 'Seed Class',
        target_academic_year: seedYear,
        target_section: 'A',
      })
      .select('id')
      .single()
    if (pub.error) throw new Error(pub.error.message)
    publicationId = pub.data.id

    // Another Student's question, written by Super Admin (staff cannot insert).
    const other = await owner.from('students').insert({ full_name: `${P}Other` }).select('id').single()
    if (other.error) throw new Error(other.error.message)
    otherStudentId = other.data.id
    otherMessageId = crypto.randomUUID()
    const msg = await admin.from('student_messages').insert({
      id: otherMessageId,
      school_id: schoolId,
      student_id: otherStudentId,
      publication_id: publicationId,
      subject: `${P}other`,
      body: 'b',
      thread_id: otherMessageId,
    })
    if (msg.error) throw new Error(msg.error.message)

    rootId = crypto.randomUUID()
    const root = await ask({ id: rootId, thread_id: rootId })
    if (root.error) throw new Error(root.error.message)
  })

  afterAll(cleanup)

  describe('thread_id (0253)', () => {
    it('a follow-up may point at the Student\'s own original', async () => {
      expect((await ask({ thread_id: rootId, body: 'follow-up' })).error).toBeNull()
    })
    it('not at another Student\'s question', async () => {
      expect((await ask({ thread_id: otherMessageId })).error?.message).toMatch(/thread does not belong/)
    })
    it('not at a follow-up (threads are one level deep)', async () => {
      const { data } = await student.from('student_messages').select('id').eq('thread_id', rootId).neq('id', rootId).limit(1).single()
      expect((await ask({ thread_id: data!.id })).error?.message).toMatch(/thread does not belong/)
    })
    it('a row without thread_id is still accepted (old app code)', async () => {
      expect((await ask({ subject: `${P}plain` })).error).toBeNull()
    })
  })

  describe('body length (0256)', () => {
    it('4000 characters pass, 4001 are refused', async () => {
      expect((await ask({ subject: `${P}long ok`, body: 'a'.repeat(4000) })).error).toBeNull()
      expect((await ask({ subject: `${P}too long`, body: 'a'.repeat(4001) })).error?.message).toMatch(/student_message_body_length/)
    })
  })

  describe('further replies (0254)', () => {
    const reply = (as: SupabaseClient, by: string | null) =>
      as.from('student_message_replies').insert({ message_id: rootId, body: 'more', replied_by: by })
    let ownerUid: string

    it('refused before the first reply', async () => {
      ownerUid = (await owner.auth.getUser()).data.user!.id
      expect((await reply(owner, ownerUid)).error).not.toBeNull()
    })
    it('the owner adds one after the first reply; status and replied_at do not move', async () => {
      await owner.from('student_messages').update({ reply_body: 'first' }).eq('id', rootId)
      const before = (await owner.from('student_messages').select('status, replied_at').eq('id', rootId).single()).data!
      expect((await reply(owner, ownerUid)).error).toBeNull()
      const after = (await owner.from('student_messages').select('status, replied_at').eq('id', rootId).single()).data!
      expect(after).toEqual(before)
    })
    it('the Student reads replies to their own question and cannot write one', async () => {
      const mine = await student.from('student_message_replies').select('body, student_id').eq('message_id', rootId)
      expect(mine.data).toEqual([{ body: 'more', student_id: studentId }])
      expect((await reply(student, null)).error).not.toBeNull()
    })
    it('the Student does not read replies to another Student\'s question', async () => {
      await admin.from('student_messages').update({ reply_body: 'first' }).eq('id', otherMessageId)
      const made = await admin.from('student_message_replies').insert({ message_id: otherMessageId, body: 'theirs', replied_by: null })
      expect(made.error).toBeNull()
      const seen = await student.from('student_message_replies').select('id').eq('message_id', otherMessageId)
      expect(seen.data ?? []).toEqual([])
    })
    it('the owner cannot edit or delete a reply', async () => {
      const upd = await owner.from('student_message_replies').update({ body: 'x' }).eq('message_id', rootId).select('id')
      expect(upd.data ?? []).toEqual([])
      const del = await owner.from('student_message_replies').delete().eq('message_id', rootId).select('id')
      expect(del.data ?? []).toEqual([])
    })
  })

  describe('seen marks (0255)', () => {
    const mark = (messageId: string, sid: string) =>
      student.from('student_message_reads').upsert({ message_id: messageId, student_id: sid }, { onConflict: 'message_id' })

    it('the Student marks their own question, twice', async () => {
      expect((await mark(rootId, studentId)).error).toBeNull()
      expect((await mark(rootId, studentId)).error).toBeNull()
      const rows = await student.from('student_message_reads').select('message_id')
      expect((rows.data ?? []).map((r) => r.message_id)).toEqual([rootId])
    })
    it('not another Student\'s question, and not under another Student\'s id', async () => {
      expect((await mark(otherMessageId, studentId)).error).not.toBeNull()
      expect((await mark(otherMessageId, otherStudentId)).error).not.toBeNull()
    })
    it('the owner reads no seen marks', async () => {
      expect((await owner.from('student_message_reads').select('message_id')).data ?? []).toEqual([])
    })
  })

  describe('withdraw (0257)', () => {
    const remove = (id: string) => student.from('student_messages').delete().eq('id', id).select('id')

    it('an unanswered own question can be withdrawn', async () => {
      const id = crypto.randomUUID()
      expect((await ask({ id, thread_id: id, subject: `${P}mistake` })).error).toBeNull()
      expect((await remove(id)).data).toEqual([{ id }])
    })
    it('an answered one cannot', async () => {
      expect((await remove(rootId)).data ?? []).toEqual([])
    })
    it('another Student\'s question cannot', async () => {
      expect((await remove(otherMessageId)).data ?? []).toEqual([])
      const still = await admin.from('student_messages').select('id').eq('id', otherMessageId)
      expect(still.data).toHaveLength(1)
    })
    it('withdrawing an original leaves its follow-ups, unlinked', async () => {
      const id = crypto.randomUUID()
      const follow = crypto.randomUUID()
      await ask({ id, thread_id: id, subject: `${P}root2` })
      await ask({ id: follow, thread_id: id, subject: `${P}root2` })
      expect((await remove(id)).data).toEqual([{ id }])
      const left = await student.from('student_messages').select('thread_id').eq('id', follow).single()
      expect(left.data).toEqual({ thread_id: null })
    })
  })
})
