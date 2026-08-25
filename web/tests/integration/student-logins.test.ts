import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { anonClient, signedIn, PASSWORD } from '../helpers/auth'

// Seam: owner-side Student login provisioning (#442) — create_student_login,
// set_student_password and the student_login_info view, all self-gating
// SECURITY DEFINER with no service-role key.
//
// Note on cleanup: deleting the students row leaves an orphan auth.users row.
// That is the documented trade-off (0068, #436) — there is no service-role key
// to delete an auth user with. The auto Student Number sequence, however, DOES
// recycle once the row is gone, so a fixture relying on it would collide with
// its own previous run's orphan on the second run. The login fixture therefore
// carries a run-unique explicit Student Number; a separate throwaway row covers
// the trigger.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

describe('Student login provisioning (#442)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let studentId: string
  const studentNo = `lg1-${Date.now()}`
  let email: string
  const firstPassword = 'lg1-first-password'

  async function cleanup() {
    await ownerA.from('students').delete().like('full_name', 'LG1 %')
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    await cleanup()

    const { data, error } = await ownerA
      .from('students')
      .insert({
        full_name: 'LG1 Nusrat',
        class_name: 'LG1 Class',
        section: 'A',
        student_no: studentNo,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    studentId = data.id
  })

  afterAll(cleanup)

  it('assigns a Student Number at admission when none is given', async () => {
    const { data, error } = await ownerA
      .from('students')
      .insert({ full_name: 'LG1 Auto', class_name: 'LG1 Class', section: 'B' })
      .select('student_no')
      .single()
    expect(error).toBeNull()
    expect(data!.student_no).toMatch(/^S\d{4,}$/)
  })

  it('the owner issues a login at the derived, non-routable address', async () => {
    const { data, error } = await ownerA.rpc('create_student_login', {
      p_student_id: studentId,
      p_password: firstPassword,
    })
    expect(error).toBeNull()
    email = data as string
    expect(email).toBe(`${studentNo.toLowerCase()}@${email.split('@')[1]}`)
    expect(email).toMatch(/\.students\.invalid$/)
  })

  it('the Student can actually sign in with it', async () => {
    const student = createClient(URL, ANON, { auth: { persistSession: false } })
    const { error } = await student.auth.signInWithPassword({ email, password: firstPassword })
    expect(error).toBeNull()

    const { data: self } = await student.from('student_self').select('full_name, student_no')
    expect(self).toEqual([{ full_name: 'LG1 Nusrat', student_no: studentNo }])
  })

  it('shows the owner the login status, and shows another school nothing', async () => {
    const { data: mine } = await ownerA
      .from('student_login_info')
      .select('email, last_sign_in_at')
      .eq('student_id', studentId)
      .maybeSingle()
    expect(mine?.email).toBe(email)
    expect(mine?.last_sign_in_at).not.toBeNull()

    const { data: theirs } = await ownerB
      .from('student_login_info')
      .select('email')
      .eq('student_id', studentId)
    expect(theirs).toEqual([])
  })

  it('refuses a second login for the same Student', async () => {
    const { error } = await ownerA.rpc('create_student_login', {
      p_student_id: studentId,
      p_password: 'another-password',
    })
    expect(error?.message).toContain('already has a login')
  })

  it('refuses an owner of another school', async () => {
    const create = await ownerB.rpc('create_student_login', {
      p_student_id: studentId,
      p_password: 'not-your-student',
    })
    expect(create.error).not.toBeNull()

    const reset = await ownerB.rpc('set_student_password', {
      p_student_id: studentId,
      p_password: 'not-your-student',
    })
    expect(reset.error).not.toBeNull()
  })

  it('refuses a password under 8 characters', async () => {
    const { error } = await ownerA.rpc('set_student_password', {
      p_student_id: studentId,
      p_password: 'short',
    })
    expect(error?.message).toContain('at least 8 characters')
  })

  it('a reset replaces the password — the old one stops working', async () => {
    const next = 'lg1-second-password'
    const { error } = await ownerA.rpc('set_student_password', {
      p_student_id: studentId,
      p_password: next,
    })
    expect(error).toBeNull()

    const stale = createClient(URL, ANON, { auth: { persistSession: false } })
    const staleAttempt = await stale.auth.signInWithPassword({ email, password: firstPassword })
    expect(staleAttempt.error).not.toBeNull()

    const fresh = createClient(URL, ANON, { auth: { persistSession: false } })
    const freshAttempt = await fresh.auth.signInWithPassword({ email, password: next })
    expect(freshAttempt.error).toBeNull()
  })

  it('a Staff User cannot issue logins, nor read the login list', async () => {
    // staff-e2e@test.local is School A's Staff User (supabase/e2e-seed.sql).
    const staff = await signedIn('staff-e2e@test.local', PASSWORD)
    const { error } = await staff.rpc('create_student_login', {
      p_student_id: studentId,
      p_password: 'staff-should-not',
    })
    expect(error).not.toBeNull()

    // The view is owner-only too (0135). Before that fix it was scoped to the
    // school alone, so any Staff User could read every Student's login address
    // and last_sign_in_at straight off PostgREST.
    const { data } = await staff.from('student_login_info').select('email')
    expect(data).toEqual([])
  })

  it('student_login_domain is not callable by an anonymous visitor', async () => {
    // It is SECURITY DEFINER and it WRITES (it pins the school's login domain).
    // 0132 shipped it without the revoke/grant pair, so PUBLIC could call it for
    // any school id at all.
    const anon = anonClient()
    const { error } = await anon.rpc('student_login_domain', {
      p_school: '00000000-0000-0000-0000-000000000000',
    })
    expect(error).not.toBeNull()
  })

  it("an owner cannot pin another school's login domain", async () => {
    const { data: schoolB } = await ownerB.from('schools').select('id').single()
    const { error } = await ownerA.rpc('student_login_domain', { p_school: schoolB!.id })
    expect(error?.message).toContain('not authorized')
  })
})
