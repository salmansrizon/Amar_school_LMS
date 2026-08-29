import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Migration 0171, map #524. An Owner could not delete an OPEN exam once it had
// any child row: the child's delete guard fires on the cascade, by which point
// the parent is already gone, and read that absence as "closed".
//
// The two halves are one rule and have to be pinned together — a fix that lets
// an open exam go must not also let a Closed exam's marks be deleted.
const TAG = 'ZZ0171'

describe('deleting an open exam is not deleting a closed one (0171)', () => {
  let owner: SupabaseClient
  let admin: SupabaseClient
  let classId: string

  const newExam = async (name: string) => {
    const { data, error } = await owner
      .from('exams')
      .insert({ name, exam_year: 2026, class_id: classId })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data.id as string
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    // Closed exams are undeletable by school roles by design, so prior runs are
    // cleaned as Super Admin — who is exempt.
    admin = await signedIn('super@test.local')
    expect((await owner.auth.getUser()).data.user).not.toBeNull()
    const { error } = await admin.from('exams').delete().like('name', `${TAG}%`)
    if (error) throw new Error(`cleanup failed: ${error.message}`)
    classId = (await owner.from('classes').select('id').eq('name', 'Seed Class').eq('section', 'A').single()).data!.id
  })

  afterAll(async () => {
    await admin.from('exams').delete().like('name', `${TAG}%`)
  })

  it('an open exam with a mark can be deleted by its Owner', async () => {
    const examId = await newExam(`${TAG} Open`)
    const student = (await owner.from('students').select('id').limit(1).single()).data!.id
    const subject = (await owner.from('subjects').select('id').limit(1).single()).data!.id
    const mark = await owner
      .from('exam_marks')
      .insert({ exam_id: examId, student_id: student, subject_id: subject, theory_obtained: 10 })
    expect(mark.error).toBeNull()

    const { data, error } = await owner.from('exams').delete().eq('id', examId).select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('a closed exam still refuses to give up its marks', async () => {
    const examId = await newExam(`${TAG} Closed`)
    const student = (await owner.from('students').select('id').limit(1).single()).data!.id
    const subject = (await owner.from('subjects').select('id').limit(1).single()).data!.id
    await owner.from('exam_marks').insert({ exam_id: examId, student_id: student, subject_id: subject, theory_obtained: 10 })
    expect((await owner.rpc('close_exam', { exam: examId })).error).toBeNull()

    const { error } = await owner.from('exam_marks').delete().eq('exam_id', examId)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/exam is closed/)
  })

  it('and a closed exam itself is still undeletable', async () => {
    const { data: closed } = await owner.from('exams').select('id').eq('name', `${TAG} Closed`).single()
    const { error } = await owner.from('exams').delete().eq('id', closed!.id)
    expect(error).not.toBeNull()
  })
})
