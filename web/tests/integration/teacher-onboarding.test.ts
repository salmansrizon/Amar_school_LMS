import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, PASSWORD } from '../helpers/auth'

// Seam: ticket #533. The four steps createTeacher composes — employee record,
// staff login, the link between them, class assignment — run here in the same
// order against the real database, and then the resulting teacher signs in and is
// asked what she can see.
//
// This is the assertion the UAT pass could not make. It created an employee,
// stopped, and reported Class Teacher behaviour as untestable because the
// employee had no login.
//
// A FIXED email, created-or-found, following staff-permissions.test.ts: there is
// no way to delete an auth user from here, so a fresh address per run would leak
// one account per run — the accumulation #541 just finished cleaning up.
const EMAIL = 'zz533-teacher@test.local'
const TAG = 'ZZ533'

describe('A teacher created in one step can actually teach (#533)', () => {
  let owner: SupabaseClient
  let teacher: SupabaseClient
  let employeeId: string
  let classId: string
  let profileId: string

  async function cleanup() {
    await owner.from('classes').update({ class_teacher_id: null }).eq('name', `${TAG} Class`)
    await owner.from('students').delete().like('full_name', `${TAG} %`)
    await owner.from('classes').delete().like('name', `${TAG}%`)
    await owner.from('employees').delete().like('full_name', `${TAG} %`)
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await cleanup()

    // Step 2 of the flow — create-or-find, as the fixture note above explains.
    const { data: created } = await owner.rpc('create_staff_user', {
      staff_email: EMAIL,
      staff_password: PASSWORD,
      staff_full_name: `${TAG} Teacher`,
    })
    if (created) {
      profileId = created as string
    } else {
      const { data: existing } = await owner
        .from('profiles')
        .select('id')
        .eq('role', 'staff_user')
        .eq('full_name', `${TAG} Teacher`)
        .single()
      profileId = existing!.id
    }

    // Step 1 — the HR record.
    const { data: employee } = await owner
      .from('employees')
      .insert({ full_name: `${TAG} Teacher` })
      .select('id')
      .single()
    employeeId = employee!.id

    // Step 3 — the link. Skipping this is exactly what the UAT pass did.
    await owner.from('employees').update({ profile_id: profileId }).eq('id', employeeId)

    // Step 4 — the class, plus a child in it and one in another class.
    const { data: klass } = await owner
      .from('classes')
      .insert({ name: `${TAG} Class`, section: 'A', class_teacher_id: employeeId })
      .select('id')
      .single()
    classId = klass!.id
    await owner.from('classes').insert({ name: `${TAG} Other`, section: 'A' })
    await owner.from('students').insert([
      { full_name: `${TAG} Mine`, class_name: `${TAG} Class`, section: 'A' },
      { full_name: `${TAG} NotMine`, class_name: `${TAG} Other`, section: 'A' },
    ])

    teacher = await signedIn(EMAIL, PASSWORD)
  })

  afterAll(cleanup)

  it('the four steps leave a teacher who can sign in', async () => {
    const { data } = await teacher.auth.getUser()
    expect(data.user).not.toBeNull()
  })

  it('the login is linked to the employee record, which is what class attachment reads', async () => {
    const { data } = await owner.from('employees').select('profile_id').eq('id', employeeId).single()
    expect(data!.profile_id).toBe(profileId)
  })

  it('the class knows its teacher', async () => {
    const { data } = await owner.from('classes').select('class_teacher_id').eq('id', classId).single()
    expect(data!.class_teacher_id).toBe(employeeId)
  })

  // The whole point: no permission grant was issued anywhere above. ADR 0021 makes
  // the assignment itself sufficient, and this is what proves that claim rather
  // than restating it.
  it('sees her own class with no permission grant issued at all', async () => {
    const { data: grants } = await owner.from('staff_permissions').select('screen_key').eq('staff_user_id', profileId)
    expect(grants ?? []).toEqual([])

    const { data: seen } = await teacher.from('students').select('full_name').like('full_name', `${TAG} %`)
    expect((seen ?? []).map((s) => s.full_name)).toEqual([`${TAG} Mine`])
  })

  it('cannot see the other class’s child', async () => {
    const { data } = await teacher.from('students').select('id').eq('full_name', `${TAG} NotMine`)
    expect(data).toEqual([])
  })
})
