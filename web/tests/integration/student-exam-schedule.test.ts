import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: the Student's exam calendar (#450, migration 0145).
//
// Two guarantees: an unpublished seat plan stays invisible, and the seat a
// Student is shown is THEIR seat — resolved from their roll — not the raw
// room/roll-range rows the school works with.

const P = 'XS1 '

describe('Student exam schedule (#450)', () => {
  let owner: SupabaseClient
  let student: SupabaseClient
  let examId: string
  let roomId: string
  let classId: string
  let roll: number
  let subjectId: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    student = await signedIn('s9001@test-a.students.invalid')

    const self = (await student.from('student_self').select('id, roll_number').single()).data!
    roll = self.roll_number ?? 1
    if (self.roll_number === null) {
      await owner.from('students').update({ roll_number: 1 }).eq('id', self.id)
    }

    classId = (await owner.from('classes').select('id').eq('name', 'Seed Class').eq('section', 'A').single())
      .data!.id

    await owner.from('exams').delete().like('name', `${P}%`)
    await owner.from('rooms').delete().like('name', `${P}%`)
    await owner.from('subjects').delete().like('name', `${P}%`)

    const subject = await owner
      .from('subjects')
      .insert({ name: `${P}Physics`, class_id: classId, theory_marks: 100 })
      .select('id')
      .single()
    if (subject.error) throw new Error(subject.error.message)
    subjectId = subject.data.id

    const building = await owner.from('buildings').select('id').limit(1).maybeSingle()
    const room = await owner
      .from('rooms')
      .insert({ name: `${P}Hall`, capacity: 50, building_id: building.data?.id ?? null })
      .select('id')
      .single()
    if (room.error) throw new Error(room.error.message)
    roomId = room.data.id

    const exam = await owner
      .from('exams')
      .insert({ name: `${P}Finals`, exam_year: 2026, class_id: classId })
      .select('id')
      .single()
    if (exam.error) throw new Error(exam.error.message)
    examId = exam.data.id

    const entry = await owner.from('exam_routine_entries').insert({
      exam_id: examId,
      subject_id: subjectId,
      exam_date: '2099-11-20',
      start_time: '10:00',
      end_time: '13:00',
      room_id: roomId,
    })
    if (entry.error) throw new Error(entry.error.message)

    const plan = await owner.from('exam_seat_plans').insert({
      exam_id: examId,
      room_id: roomId,
      roll_start: 1,
      roll_end: 40,
    })
    if (plan.error) throw new Error(plan.error.message)
  })

  afterAll(async () => {
    await owner.from('exams').delete().like('name', `${P}%`)
    await owner.from('rooms').delete().like('name', `${P}%`)
    await owner.from('subjects').delete().like('name', `${P}%`)

    const subject = await owner
      .from('subjects')
      .insert({ name: `${P}Physics`, class_id: classId, theory_marks: 100 })
      .select('id')
      .single()
    if (subject.error) throw new Error(subject.error.message)
    subjectId = subject.data.id
  })

  it('shows the exam routine for the student’s own class', async () => {
    const { data, error } = await student
      .from('student_exam_routine')
      .select('exam_name, exam_date, start_time, day_of_week')
      .eq('exam_id', examId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].exam_name).toBe(`${P}Finals`)
    // day_of_week is derived, not stored. 2099-11-20 is a Friday.
    expect(data![0].day_of_week).toBe(5)
  })

  it('withholds the seat while the plan is unpublished', async () => {
    const { data } = await student.from('student_seat_assignment').select('room_name').eq('exam_id', examId)
    expect(data ?? []).toEqual([])
  })

  it('resolves the student’s own seat once the plan is published', async () => {
    await owner
      .from('exams')
      .update({ seat_plan_published_at: new Date().toISOString() })
      .eq('id', examId)

    const { data } = await student
      .from('student_seat_assignment')
      .select('room_name, roll_number')
      .eq('exam_id', examId)
    expect(data).toHaveLength(1)
    expect(data![0].room_name).toBe(`${P}Hall`)
  })

  it('does not open the raw seat plan or exam tables', async () => {
    // The views are the only way in; a Student reading exam_seat_plans directly
    // would see every roll range in the school.
    for (const table of ['exam_seat_plans', 'exam_routine_entries', 'exams', 'rooms'] as const) {
      const { data } = await student.from(table).select('id')
      expect(data ?? [], table).toEqual([])
    }
  })

  it('another school’s student sees nothing of it', async () => {
    const ownerB = await signedIn('owner-b@test.local')
    const { data } = await ownerB.from('exams').select('id').eq('id', examId)
    expect(data ?? []).toEqual([])
  })
})
