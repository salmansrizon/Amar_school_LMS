import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: the results publication gate (#440) and the Student's own result (#449,
// migration 0143).
//
// The gate is the whole point: an exam mid-marking must never be visible. Every
// case here is about that, plus the rank function that must never become a way
// to read the class's marks.

const P = 'RS1 '

describe('Student exam results (#449)', () => {
  let owner: SupabaseClient
  let student: SupabaseClient
  let studentId: string
  let schoolId: string
  let examId: string
  let subjectId: string
  let classId: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    student = await signedIn('s9001@test-a.students.invalid')
    const self = (await student.from('student_self').select('id, school_id').single()).data!
    studentId = self.id
    schoolId = self.school_id

    classId = (await owner.from('classes').select('id').eq('name', 'Seed Class').eq('section', 'A').single())
      .data!.id

    await owner.from('exams').delete().like('name', `${P}%`)
    await owner.from('subjects').delete().like('name', `${P}%`)

    const scheme = await owner.from('grading_schemes').select('id').limit(1).maybeSingle()

    const subject = await owner
      .from('subjects')
      .insert({ name: `${P}Maths`, class_id: classId, theory_marks: 100 })
      .select('id')
      .single()
    if (subject.error) throw new Error(subject.error.message)
    subjectId = subject.data.id

    const exam = await owner
      .from('exams')
      .insert({
        name: `${P}Half Yearly`,
        exam_year: 2026,
        class_id: classId,
        grading_scheme_id: scheme.data?.id ?? null,
      })
      .select('id')
      .single()
    if (exam.error) throw new Error(exam.error.message)
    examId = exam.data.id

    const mark = await owner.from('exam_marks').insert({
      exam_id: examId,
      school_id: schoolId,
      student_id: studentId,
      subject_id: subjectId,
      theory_obtained: 72,
    })
    if (mark.error) throw new Error(mark.error.message)
  })

  afterAll(async () => {
    await owner.from('exams').delete().like('name', `${P}%`)
    await owner.from('subjects').delete().like('name', `${P}%`)
  })

  it('an unpublished exam is invisible to the student', async () => {
    const { data } = await student.from('student_exam_result').select('exam_id').eq('exam_id', examId)
    expect(data ?? []).toEqual([])
  })

  it('rank reveals nothing while the exam is unpublished', async () => {
    const { data } = await student.rpc('student_exam_rank', { p_exam: examId })
    expect(data ?? []).toEqual([])
  })

  it('publishing makes the student’s own marks visible', async () => {
    const publish = await owner
      .from('exams')
      .update({ results_published_at: new Date().toISOString() })
      .eq('id', examId)
      .select('id')
    expect(publish.error).toBeNull()

    const { data } = await student
      .from('student_exam_result')
      .select('subject_name, obtained_marks')
      .eq('exam_id', examId)
    expect(data).toEqual([{ subject_name: `${P}Maths`, obtained_marks: 72 }])
  })

  it('the student still cannot read exam_marks directly', async () => {
    // The view is the only way in; the table stays shut, so no student can read
    // a classmate's marks even once the exam is published.
    const { data } = await student.from('exam_marks').select('id')
    expect(data ?? []).toEqual([])
  })

  it('rank returns the student’s own position and nothing else', async () => {
    const { data } = await student.rpc('student_exam_rank', { p_exam: examId })
    const rows = (data ?? []) as { rank: number; out_of: number }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].rank).toBeGreaterThanOrEqual(1)
    expect(rows[0].out_of).toBeGreaterThanOrEqual(1)
  })

  it('unpublishing takes it away again — publishing is reversible', async () => {
    await owner.from('exams').update({ results_published_at: null }).eq('id', examId)
    const { data } = await student.from('student_exam_result').select('exam_id').eq('exam_id', examId)
    expect(data ?? []).toEqual([])
  })
})
