import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: the Student's routine read (#444, migration 0137).
//
// The whole surface is one definer view, student_routine, so this also pins the
// thing that view exists to guarantee: a Student reaches subject, teacher and
// room names WITHOUT any grant on subjects, employees or rooms — and sees
// nothing at all until the school publishes.
//
// Fixture: the seeded Student of School A, in "Seed Class - A"
// (supabase/seed-test.sql).

describe('Student routine (#444)', () => {
  let owner: SupabaseClient
  let student: SupabaseClient
  let classId: string
  let subjectId: string
  let teacherId: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    student = await signedIn('s9001@test-a.students.invalid')

    const { data: klass } = await owner
      .from('class_offerings')
      .select('id')
      .eq('name', 'Seed Class')
      .eq('section', 'A')
      .single()
    classId = klass!.id

    // Plain delete-then-insert: there is no unique key to upsert against, and a
    // silent upsert failure is how the first cut of this fixture broke.
    await owner.from('routine_slots').delete().eq('class_offering_id', classId)
    await owner.from('class_routines').delete().eq('class_id', classId)
    await owner.from('subjects').delete().eq('name', 'RT1 Physics')
    await owner.from('employees').delete().eq('full_name', 'RT1 Karim Sir')

    const subject = await owner
      .from('subjects')
      .insert({ name: 'RT1 Physics', class_id: classId, theory_marks: 100 })
      .select('id')
      .single()
    if (subject.error) throw new Error(`fixture subject: ${subject.error.message}`)
    subjectId = subject.data.id

    const teacher = await owner
      .from('employees')
      .insert({ full_name: 'RT1 Karim Sir' })
      .select('id')
      .single()
    if (teacher.error) throw new Error(`fixture teacher: ${teacher.error.message}`)
    teacherId = teacher.data.id

    // Draft to begin with: a routine row exists, publish marker does not.
    const slot = await owner.from('routine_slots').insert({
      class_offering_id: classId,
      day_of_week: 2,
      period: 3,
      subject_id: subjectId,
      teacher_id: teacherId,
    })
    if (slot.error) throw new Error(slot.error.message)
  })

  afterAll(async () => {
    await owner.from('routine_slots').delete().eq('class_offering_id', classId)
    await owner.from('class_routines').delete().eq('class_id', classId)
    await owner.from('subjects').delete().eq('name', 'RT1 Physics')
    await owner.from('employees').delete().eq('full_name', 'RT1 Karim Sir')
  })

  it('shows a Student nothing while the routine is a draft', async () => {
    const { data, error } = await student.from('student_routine').select('*')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('shows the resolved routine once the school publishes', async () => {
    const published = await owner
      .from('class_routines')
      .insert({ class_id: classId, published_at: new Date().toISOString() })
    expect(published.error).toBeNull()

    const { data, error } = await student
      .from('student_routine')
      .select('day_of_week, period, subject_name, teacher_name')
    expect(error).toBeNull()
    expect(data).toEqual([
      { day_of_week: 2, period: 3, subject_name: 'RT1 Physics', teacher_name: 'RT1 Karim Sir' },
    ])
  })

  it('reaches the teacher name without any grant on employees', async () => {
    // The point of the view. A Student has no business reading the HR record,
    // and here they never touch it.
    const { data } = await student.from('employees').select('id, full_name')
    expect(data ?? []).toEqual([])
  })

  it('reads its own school off days and the national calendar', async () => {
    const day = '2099-04-14'
    await owner.from('off_days').upsert({ day, label: 'RT1 Pohela Boishakh' })
    const { data, error } = await student.from('off_days').select('day, label').eq('day', day)
    expect(error).toBeNull()
    expect(data).toEqual([{ day, label: 'RT1 Pohela Boishakh' }])

    const central = await student.from('central_off_days').select('day').limit(1)
    expect(central.error).toBeNull()

    await owner.from('off_days').delete().eq('day', day)
  })

  it('another school’s Student sees none of it', async () => {
    const ownerB = await signedIn('owner-b@test.local')
    const { data } = await ownerB.from('class_offerings').select('id').eq('name', 'Seed Class')
    expect(data ?? []).toEqual([])
  })
})
