import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anonClient, signedIn } from '../helpers/auth'

// NOT RUN. Written with migration 0223_exam_marks_absent_and_atomic_save.sql,
// which is not applied; it fails until that migration is on the test database.
//
// Seam (#679, #700): nullable components, the absent flag and its CHECK, and
// save_exam_marks() doing the upsert and the delete as one transaction.

const P = 'EMA Test'

describe('Exam marks: absent, half-filled rows and the atomic save (#679, #700)', () => {
  let owner: SupabaseClient
  let examId: string
  let subjectId: string
  let students: string[]

  async function cleanup() {
    await owner.from('exams').delete().like('name', `${P}%`)
    await owner.from('class_offerings').delete().like('name', `${P}%`)
    await owner.from('students').delete().like('full_name', `${P}%`)
  }

  const marks = async () =>
    (
      await owner
        .from('exam_marks')
        .select('student_id, theory_obtained, mcq_obtained, obtained_marks, is_absent')
        .eq('exam_id', examId)
    ).data ?? []
  const of = async (studentId: string) => (await marks()).find((m) => m.student_id === studentId)

  const save = (rows: object[], cleared: string[] = []) =>
    owner.rpc('save_exam_marks', { p_exam: examId, p_subject: subjectId, p_rows: rows, p_cleared: cleared })

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await cleanup()
    const classId = (
      await owner.from('class_offerings').insert({ name: `${P} Class`, section: 'A' }).select('id').single()
    ).data!.id
    subjectId = (
      await owner
        .from('subjects')
        .insert({ class_id: classId, name: `${P} Subject`, theory_marks: 70, mcq_marks: 30 })
        .select('id')
        .single()
    ).data!.id
    students = []
    for (const n of [1, 2, 3]) {
      const res = await owner
        .from('students')
        .insert({ full_name: `${P} Student ${n}`, class_name: `${P} Class`, section: 'A', roll_number: n })
        .select('id')
        .single()
      if (res.error) throw new Error(res.error.message)
      students.push(res.data.id)
    }
    examId = (
      await owner.from('exams').insert({ name: `${P} Exam`, exam_year: 2026, class_id: classId }).select('id').single()
    ).data!.id
  })

  afterAll(cleanup)

  it('stores a full row, a half-filled row and an absent row in one call', async () => {
    const { error } = await save([
      { student_id: students[0], theory: 50, mcq: 20, practical: 0, is_absent: false },
      { student_id: students[1], theory: 40, mcq: null, practical: 0, is_absent: false },
      { student_id: students[2], theory: 0, mcq: 0, practical: 0, is_absent: true },
    ])
    expect(error).toBeNull()
    expect(Number((await of(students[0]))!.obtained_marks)).toBe(70)
    // A null component leaves the generated total null: "not entered yet".
    expect(await of(students[1])).toMatchObject({ mcq_obtained: null, obtained_marks: null, is_absent: false })
    const absent = await of(students[2])
    expect(absent!.is_absent).toBe(true)
    expect(Number(absent!.obtained_marks)).toBe(0)
  })

  it('a second save updates the row instead of adding one, and deletes the cleared student', async () => {
    const { error } = await save(
      [{ student_id: students[1], theory: 40, mcq: 25, practical: 0, is_absent: false }],
      [students[0]],
    )
    expect(error).toBeNull()
    expect(await of(students[0])).toBeUndefined()
    expect(Number((await of(students[1]))!.obtained_marks)).toBe(65)
    expect(await marks()).toHaveLength(2)
  })

  it('is atomic: when the upsert fails, the delete in the same call does not happen', async () => {
    const before = await marks()
    const { error } = await save(
      // Negative mark: refused by the column CHECK.
      [{ student_id: students[0], theory: -5, mcq: 0, practical: 0, is_absent: false }],
      [students[1]],
    )
    expect(error).not.toBeNull()
    expect(await marks()).toEqual(before)
  })

  it('refuses an absent row that carries marks', async () => {
    const { error } = await save([{ student_id: students[0], theory: 10, mcq: 0, practical: 0, is_absent: true }])
    expect(error?.message).toMatch(/exam_marks_absent_is_zero/)
  })

  it('still obeys the closed-exam guard: the function is security invoker', async () => {
    await owner.from('exams').update({ status: 'closed' }).eq('id', examId)
    const { error } = await save([{ student_id: students[0], theory: 10, mcq: 10, practical: 0, is_absent: false }])
    expect(error?.message).toMatch(/exam is closed/)
  })

  it('an anonymous caller cannot execute it', async () => {
    const { error } = await anonClient().rpc('save_exam_marks', {
      p_exam: examId,
      p_subject: subjectId,
      p_rows: [],
      p_cleared: [],
    })
    expect(error).not.toBeNull()
  })
})
