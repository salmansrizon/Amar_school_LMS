import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { signedIn, PASSWORD } from '../helpers/auth'
import { ensureStaffLogin } from '../helpers/staff'
import { schoolFixtures } from '../helpers/school-fixture'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// start_academic_year (issue #570, #594) — the "Start Academic Year N" named
// domain action: School Owner only, forward-only, a pure
// schools.active_academic_year pointer flip, audited via the generic audit
// engine, with its own transition-only trigger closing the "owner updates
// own school" RLS policy's own bypass.
//
// Code-review follow-up: the first version of this suite ran every
// assertion against owner-a's shared fixture school. active_academic_year
// is forward-only with NO undo path — not even a raw super-admin table
// update, since the transition-only trigger (0194) blocks that regardless
// of caller — so every run of that version permanently advanced the one
// School every other integration suite in this repo shares. Fixed by
// running against a disposable, isolated School instead (schoolFixtures,
// this repo's own #541 fixture-leak fix — see school-trial.test.ts /
// owner-claim.test.ts), deleted in afterAll regardless of what value
// active_academic_year ends up at.
//
// A genuine School Owner session is required (the RPC checks
// app_current_role() = 'school_owner' against the CALLER's own profile —
// there is no "act as" parameter to fake this with an existing session).
// The only way to mint one for a brand-new School is the real public
// onboarding path — sign up, then redeem_school_claim_code — mirrored here
// exactly from owner-claim.test.ts / school-claim-codes.test.ts, including
// that same pattern's own established trade-off: a project with signup
// email confirmation on, or an exhausted signup rate limit, yields no
// session, and the Owner-scoped assertions below skip rather than fall
// back to touching a shared fixture school.
async function freshSignedUpUser(): Promise<SupabaseClient | null> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const email = `zz-say-${crypto.randomUUID().slice(0, 12)}@example.com`
  const { data, error } = await client.auth.signUp({ email, password: PASSWORD })
  if (error || !data.session) return null
  return client
}

describe('start_academic_year (#570, #594)', () => {
  let admin: SupabaseClient
  let staff: SupabaseClient
  let fresh: SupabaseClient | null
  let schoolId: string
  let initialYear: number | null

  const schools = schoolFixtures(() => admin)

  beforeAll(async () => {
    admin = await signedIn('super@test.local')

    // Staff fixture for the "non-owner" check below — kept on owner-a's
    // existing shared School deliberately: the RPC's role check runs and
    // raises BEFORE any row is touched, so this never mutates that fixture,
    // and it means at least one assertion here never depends on the
    // rate-limit-prone signup path.
    const ownerA = await signedIn('owner-a@test.local')
    await ensureStaffLogin(ownerA, { email: 'say-staff@test.local', fullName: 'SAY Staff', screens: ['institute'] })
    staff = await signedIn('say-staff@test.local', PASSWORD)

    schoolId = await schools.create({ name: `ZZ Academic Year ${crypto.randomUUID().slice(0, 8)}` })
    const { data: school } = await admin.from('schools').select('active_academic_year').eq('id', schoolId).single()
    initialYear = school!.active_academic_year

    fresh = await freshSignedUpUser()
    if (fresh) {
      const { data: code } = await admin.rpc('generate_school_claim_code', { sid: schoolId })
      const { error } = await fresh.rpc('redeem_school_claim_code', {
        code_text: (code as { code: string }).code,
        desired_subdomain: `zz-ay-${crypto.randomUUID().slice(0, 6)}`,
      })
      if (error) throw new Error(error.message)
    }
  })

  afterAll(schools.cleanup)

  it('rejects a non-owner (Staff User) caller', async () => {
    const { error } = await staff.rpc('start_academic_year', { p_year: 2050 })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/School Owner only/)
  })

  it('rejects a year outside the 2000-2100 bound', async () => {
    if (!fresh) return // signup confirmation on / rate-limited -> skip, per this suite's own established pattern
    const { error: tooLow } = await fresh.rpc('start_academic_year', { p_year: 1999 })
    expect(tooLow).not.toBeNull()
    expect(tooLow!.message).toMatch(/between 2000 and 2100/)

    const { error: tooHigh } = await fresh.rpc('start_academic_year', { p_year: 2101 })
    expect(tooHigh).not.toBeNull()
    expect(tooHigh!.message).toMatch(/between 2000 and 2100/)
  })

  it('rejects a year that is not strictly greater than the current active year', async () => {
    if (!fresh) return
    // Fresh schools pick up the current-calendar-year DB default (0182) at
    // insert time, so this is not a reachable null state to guard here.
    expect(initialYear).not.toBeNull()

    const { error: same } = await fresh.rpc('start_academic_year', { p_year: initialYear })
    expect(same).not.toBeNull()
    expect(same!.message).toMatch(/greater than the current active academic year/)

    const { error: backward } = await fresh.rpc('start_academic_year', { p_year: initialYear! - 1 })
    expect(backward).not.toBeNull()
    expect(backward!.message).toMatch(/greater than the current active academic year/)
  })

  it('a direct UPDATE of active_academic_year is refused, even for the Owner', async () => {
    if (!fresh) return
    const { error } = await fresh
      .from('schools')
      .update({ active_academic_year: initialYear! + 1 })
      .eq('id', schoolId)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/may only be changed by start_academic_year/)

    const { data: school } = await admin.from('schools').select('active_academic_year').eq('id', schoolId).single()
    expect(school!.active_academic_year).toBe(initialYear)
  })

  it('atomically advances the year and records an audit entry', async () => {
    if (!fresh) return
    const target = initialYear! + 1
    const since = new Date(Date.now() - 5000).toISOString()

    const { data, error } = await fresh.rpc('start_academic_year', { p_year: target })
    expect(error).toBeNull()
    expect(data).toBe(target)

    const { data: school } = await admin.from('schools').select('active_academic_year').eq('id', schoolId).single()
    expect(school!.active_academic_year).toBe(target)

    const { data: auditRows } = await admin
      .from('audit_log')
      .select('action, before, after')
      .eq('entity_type', 'school')
      .eq('entity_id', schoolId)
      .eq('action', 'configure')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
    expect(auditRows).toHaveLength(1)
    expect((auditRows![0].before as { active_academic_year: number | null }).active_academic_year).toBe(initialYear)
    expect((auditRows![0].after as { active_academic_year: number }).active_academic_year).toBe(target)
  })
})
