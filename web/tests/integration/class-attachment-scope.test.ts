import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, PASSWORD } from '../helpers/auth'

// Seam: migration 0160 / ADR 0021 — a class attachment narrows a Grant.
//
// Every actor below holds the `students` grant where it matters, so a passing
// row here is the attachment doing the work and not the Grant. The point of the
// ticket (#525) is that the Grant alone used to be enough.
//
//   Owner                     | whole school
//   office-staff (no employee)| whole school
//   teacher-e2e (class teacher of ZZ525-A) | only ZZ525-A
//   subject-teacher (employee, unattached to these) | neither
const TAG = 'ZZ525'

describe('Class attachment narrows a Grant (#525, migration 0160)', () => {
  let owner: SupabaseClient
  let officeStaff: SupabaseClient
  let classTeacher: SupabaseClient
  let unattached: SupabaseClient
  let studentInA: string
  let studentInB: string

  async function cleanup() {
    await owner.from('students').delete().like('full_name', `${TAG} %`)
    await owner.from('classes').delete().like('name', `${TAG}%`)
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    officeStaff = await signedIn('office-staff@test.local', PASSWORD)
    classTeacher = await signedIn('teacher-e2e@test.local', PASSWORD)
    unattached = await signedIn('subject-teacher@test.local', PASSWORD)
    await cleanup()

    const teacherProfile = (await classTeacher.auth.getUser()).data.user!.id
    const { data: employee } = await owner
      .from('employees')
      .select('id')
      .eq('profile_id', teacherProfile)
      .is('archived_at', null)
      .single()

    // A is hers; B is not. Same school, so only the attachment separates them.
    const { error: classErr } = await owner.from('classes').insert([
      { name: `${TAG}-A`, section: 'A', class_teacher_id: employee!.id },
      { name: `${TAG}-B`, section: 'A' },
    ])
    if (classErr) throw new Error(classErr.message)

    const { data: students, error: studentErr } = await owner
      .from('students')
      .insert([
        { full_name: `${TAG} Child A`, class_name: `${TAG}-A`, section: 'A' },
        { full_name: `${TAG} Child B`, class_name: `${TAG}-B`, section: 'A' },
      ])
      .select('id, class_name')
    if (studentErr) throw new Error(studentErr.message)
    studentInA = students!.find((s) => s.class_name === `${TAG}-A`)!.id
    studentInB = students!.find((s) => s.class_name === `${TAG}-B`)!.id
  })

  afterAll(cleanup)

  const namesFor = async (client: SupabaseClient) => {
    const { data } = await client.from('students').select('full_name').like('full_name', `${TAG} %`)
    return (data ?? []).map((s) => s.full_name).sort()
  }

  it('the Owner keeps the whole school', async () => {
    expect(await namesFor(owner)).toEqual([`${TAG} Child A`, `${TAG} Child B`])
  })

  it('office staff — no employees row — keep the whole school', async () => {
    expect(await namesFor(officeStaff)).toEqual([`${TAG} Child A`, `${TAG} Child B`])
  })

  it('a Class Teacher sees her own class and not the other one', async () => {
    expect(await namesFor(classTeacher)).toEqual([`${TAG} Child A`])
  })

  // The case that decided the design: keying on the attachment rather than the
  // employees row would have handed this actor the whole school.
  it('an Employee with no attachment to these classes sees neither', async () => {
    expect(await namesFor(unattached)).toEqual([])
  })

  it('a Class Teacher cannot reach another class by guessed id', async () => {
    const { data } = await classTeacher.from('students').select('id').eq('id', studentInB).maybeSingle()
    expect(data).toBeNull()
  })

  it('a Class Teacher cannot archive another class child', async () => {
    await classTeacher.from('students').update({ archived_at: new Date().toISOString() }).eq('id', studentInB)
    const { data } = await owner.from('students').select('archived_at').eq('id', studentInB).single()
    expect(data!.archived_at).toBeNull()
  })

  it('a Class Teacher can still act on her own child', async () => {
    const { error } = await classTeacher
      .from('students')
      .update({ guardian_name: `${TAG} Guardian` })
      .eq('id', studentInA)
    expect(error).toBeNull()
    const { data } = await owner.from('students').select('guardian_name').eq('id', studentInA).single()
    expect(data!.guardian_name).toBe(`${TAG} Guardian`)
  })

  // The UAT pass reached /school/classes as a Class Teacher and found
  // destructive catalogue controls live. Reading the catalogue is still fine —
  // every class picker needs it — but a teaching assignment is not authority to
  // delete the school's classes.
  it('a Class Teacher reads the class catalogue but cannot write it', async () => {
    const { data: readable } = await classTeacher.from('classes').select('name').like('name', `${TAG}%`)
    expect((readable ?? []).length).toBe(2)

    await classTeacher.from('classes').delete().eq('name', `${TAG}-B`)
    const { data: still } = await owner.from('classes').select('name').eq('name', `${TAG}-B`)
    expect((still ?? []).length).toBe(1)
  })

  it('office staff holding the classes grant can still write the catalogue', async () => {
    const { error } = await officeStaff.from('classes').update({ group_department: 'Science' }).eq('name', `${TAG}-B`)
    expect(error).toBeNull()
  })
})
