import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// NOT RUN. Written with migration 0221_student_reads_grading_scheme.sql, which
// is not applied; it fails until that migration is on the test database.
//
// Seam (#702): a Student reads the grading scheme and bands of an exam that is
// published AND holds a mark of theirs — and no other scheme.

const P = 'GSR1 '

describe('Student reads the grading scheme of their own published result (#702)', () => {
  let owner: SupabaseClient
  let student: SupabaseClient
  let examId: string
  let usedScheme: string
  let unusedScheme: string

  async function cleanup() {
    await owner.from('exams').delete().like('name', `${P}%`)
    await owner.from('subjects').delete().like('name', `${P}%`)
    await owner.from('grading_schemes').delete().like('name', `${P}%`)
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    student = await signedIn('s9001@test-a.students.invalid')
    const self = (await student.from('student_self').select('id, school_id').single()).data!
    await cleanup()

    const classId = (
      await owner.from('class_offerings').select('id').eq('name', 'Seed Class').eq('section', 'A').single()
    ).data!.id

    const scheme = async (name: string) => {
      const res = await owner
        .from('grading_schemes')
        .insert({ name: `${P}${name}`, scheme_type: 'letter' })
        .select('id')
        .single()
      if (res.error) throw new Error(res.error.message)
      const band = await owner
        .from('grade_bands')
        .insert({ grading_scheme_id: res.data.id, label: 'A', min_percent: 0, max_percent: 100 })
      if (band.error) throw new Error(band.error.message)
      return res.data.id as string
    }
    usedScheme = await scheme('Used')
    unusedScheme = await scheme('Unused')

    const subject = await owner
      .from('subjects')
      .insert({ name: `${P}Maths`, class_id: classId, theory_marks: 100 })
      .select('id')
      .single()
    if (subject.error) throw new Error(subject.error.message)

    const exam = await owner
      .from('exams')
      .insert({ name: `${P}Half Yearly`, exam_year: 2026, class_id: classId, grading_scheme_id: usedScheme })
      .select('id')
      .single()
    if (exam.error) throw new Error(exam.error.message)
    examId = exam.data.id

    const mark = await owner.from('exam_marks').insert({
      exam_id: examId,
      school_id: self.school_id,
      student_id: self.id,
      subject_id: subject.data.id,
      theory_obtained: 72,
    })
    if (mark.error) throw new Error(mark.error.message)
  })

  afterAll(cleanup)

  const readable = async () => {
    const [schemes, bands] = await Promise.all([
      student.from('grading_schemes').select('id').in('id', [usedScheme, unusedScheme]),
      student.from('grade_bands').select('grading_scheme_id').in('grading_scheme_id', [usedScheme, unusedScheme]),
    ])
    return {
      schemes: (schemes.data ?? []).map((s) => s.id),
      bands: (bands.data ?? []).map((b) => b.grading_scheme_id),
    }
  }

  it('reads nothing while the exam is unpublished', async () => {
    expect(await readable()).toEqual({ schemes: [], bands: [] })
  })

  it('reads the scheme and its bands once the exam is published — and only that scheme', async () => {
    await owner.from('exams').update({ results_published_at: new Date().toISOString() }).eq('id', examId)
    expect(await readable()).toEqual({ schemes: [usedScheme], bands: [usedScheme] })
  })

  it('cannot write the scheme or its bands', async () => {
    await student.from('grading_schemes').update({ pass_mark_percent: 1 }).eq('id', usedScheme)
    await student.from('grade_bands').delete().eq('grading_scheme_id', usedScheme)
    const scheme = await owner.from('grading_schemes').select('pass_mark_percent').eq('id', usedScheme).single()
    const bands = await owner.from('grade_bands').select('id').eq('grading_scheme_id', usedScheme)
    expect(Number(scheme.data!.pass_mark_percent)).toBe(33)
    expect(bands.data).toHaveLength(1)
  })

  it('loses the read again when the exam is unpublished', async () => {
    await owner.from('exams').update({ results_published_at: null }).eq('id', examId)
    expect(await readable()).toEqual({ schemes: [], bands: [] })
  })
})
