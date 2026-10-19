import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// NOT RUN. Written with migration 0224_exam_routine_no_class_overlap.sql, which
// is not applied; it fails until that migration is on the test database.
//
// Seam (#699): the database refuses two overlapping sittings of one class, in
// one exam or across two, also when both saves arrive at the same moment.

const P = 'ERO Test'
const DAY = '2027-03-10'

describe('Exam routine: no overlapping sittings within a class (#699)', () => {
  let owner: SupabaseClient
  let examA: string
  let examB: string
  let otherClassExam: string
  let bangla: string
  let english: string
  let otherSubject: string

  async function cleanup() {
    await owner.from('exams').delete().like('name', `${P}%`)
    await owner.from('class_offerings').delete().like('name', `${P}%`)
  }

  const sitting = (exam_id: string, subject_id: string, start_time: string, end_time: string, exam_date = DAY) =>
    owner
      .from('exam_routine_entries')
      .upsert({ exam_id, subject_id, exam_date, start_time, end_time }, { onConflict: 'exam_id,subject_id' })

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await cleanup()
    const offering = async (name: string) =>
      (await owner.from('class_offerings').insert({ name, section: 'A' }).select('id').single()).data!.id as string
    const subject = async (class_id: string, name: string) =>
      (await owner.from('subjects').insert({ class_id, name, theory_marks: 100 }).select('id').single()).data!
        .id as string
    const exam = async (name: string, class_id: string) =>
      (await owner.from('exams').insert({ name, exam_year: 2027, class_id }).select('id').single()).data!.id as string

    const classId = await offering(`${P} Class`)
    const otherClass = await offering(`${P} Other Class`)
    bangla = await subject(classId, `${P} Bangla`)
    english = await subject(classId, `${P} English`)
    otherSubject = await subject(otherClass, `${P} Maths`)
    examA = await exam(`${P} Exam A`, classId)
    examB = await exam(`${P} Exam B`, classId)
    otherClassExam = await exam(`${P} Other Exam`, otherClass)
  })

  afterAll(cleanup)

  it('accepts the first sitting, and a re-save of the same subject at a new time', async () => {
    expect((await sitting(examA, bangla, '10:00', '12:00')).error).toBeNull()
    expect((await sitting(examA, bangla, '10:30', '12:30')).error).toBeNull()
  })

  it('refuses an overlapping sitting in the same exam', async () => {
    expect((await sitting(examA, english, '12:00', '13:00')).error?.code).toBe('23P01')
  })

  it('refuses an overlapping sitting in ANOTHER exam of the class, same subject included', async () => {
    expect((await sitting(examB, english, '11:00', '13:00')).error?.code).toBe('23P01')
    expect((await sitting(examB, bangla, '11:00', '13:00')).error?.code).toBe('23P01')
  })

  it('accepts back-to-back, another day, and another class at the same time', async () => {
    expect((await sitting(examB, english, '12:30', '14:00')).error).toBeNull()
    expect((await sitting(examB, bangla, '10:30', '12:30', '2027-03-11')).error).toBeNull()
    expect((await sitting(otherClassExam, otherSubject, '10:30', '12:30')).error).toBeNull()
  })

  it('of two simultaneous overlapping saves, exactly one is stored', async () => {
    const day = '2027-03-12'
    const [a, b] = await Promise.all([
      sitting(examA, english, '09:00', '11:00', day),
      owner
        .from('exam_routine_entries')
        .update({ exam_date: day, start_time: '10:00', end_time: '12:00' })
        .eq('exam_id', examB)
        .eq('subject_id', english),
    ])
    expect([a.error?.code, b.error?.code].filter((c) => c === '23P01')).toHaveLength(1)
  })
})
