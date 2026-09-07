import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, PASSWORD } from '../helpers/auth'
import { ensureStaffLogin } from '../helpers/staff'

// start_academic_year (issue #570, #594) — the "Start Academic Year N" named
// domain action, grilled and confirmed with the user: School Owner only,
// forward-only, a pure schools.active_academic_year pointer flip (no Class
// Offering cloning, no Enrollment/promotion interaction), audited via the
// generic audit engine, and its own transition-only trigger closes the
// "owner updates own school" RLS policy's own bypass (0043 has no per-column
// restriction, so without the trigger a plain table UPDATE could skip the
// RPC's forward-only check entirely).
//
// This suite genuinely advances owner-a's school's active_academic_year and
// cannot restore it afterward — forward-only is enforced against direct
// writes too (the whole point of the transition-only trigger below), so
// there is no "put it back" step. Harmless: nothing else in this suite reads
// or asserts the column's absolute value (only relative/forward-only
// behavior), matching the product's own real, permanent Start Academic Year
// action.
describe('start_academic_year (#570, #594)', () => {
  let owner: SupabaseClient
  let staff: SupabaseClient
  let schoolId: string
  let initialYear: number | null

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    await ensureStaffLogin(owner, {
      email: 'say-staff@test.local',
      fullName: 'SAY Staff',
      screens: ['institute'],
    })
    staff = await signedIn('say-staff@test.local', PASSWORD)

    const { data: user } = await owner.auth.getUser()
    const { data: profile } = await owner.from('profiles').select('school_id').eq('id', user.user!.id).single()
    schoolId = profile!.school_id

    const { data: school } = await owner.from('schools').select('active_academic_year').eq('id', schoolId).single()
    initialYear = school!.active_academic_year
  })

  it('rejects a non-owner (Staff User) caller', async () => {
    const { error } = await staff.rpc('start_academic_year', { p_year: (initialYear ?? 2000) + 1 })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/School Owner only/)
  })

  it('rejects a year outside the 2000-2100 bound', async () => {
    const { error: tooLow } = await owner.rpc('start_academic_year', { p_year: 1999 })
    expect(tooLow).not.toBeNull()
    expect(tooLow!.message).toMatch(/between 2000 and 2100/)

    const { error: tooHigh } = await owner.rpc('start_academic_year', { p_year: 2101 })
    expect(tooHigh).not.toBeNull()
    expect(tooHigh!.message).toMatch(/between 2000 and 2100/)
  })

  it('rejects a year that is not strictly greater than the current active year', async () => {
    // Wave 6 (#591) backfilled every School, so a null active_academic_year
    // is not a reachable state here — guarded rather than assumed.
    expect(initialYear).not.toBeNull()

    const { error: same } = await owner.rpc('start_academic_year', { p_year: initialYear })
    expect(same).not.toBeNull()
    expect(same!.message).toMatch(/greater than the current active academic year/)

    const { error: backward } = await owner.rpc('start_academic_year', { p_year: initialYear! - 1 })
    expect(backward).not.toBeNull()
    expect(backward!.message).toMatch(/greater than the current active academic year/)
  })

  it('a direct UPDATE of active_academic_year is refused, even for the Owner', async () => {
    const { error } = await owner
      .from('schools')
      .update({ active_academic_year: (initialYear ?? 2000) + 1 })
      .eq('id', schoolId)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/may only be changed by start_academic_year/)

    const { data: school } = await owner.from('schools').select('active_academic_year').eq('id', schoolId).single()
    expect(school!.active_academic_year).toBe(initialYear)
  })

  it('atomically advances the year and records an audit entry', async () => {
    const target = initialYear! + 1
    const since = new Date(Date.now() - 5000).toISOString()

    const { data, error } = await owner.rpc('start_academic_year', { p_year: target })
    expect(error).toBeNull()
    expect(data).toBe(target)

    const { data: school } = await owner.from('schools').select('active_academic_year').eq('id', schoolId).single()
    expect(school!.active_academic_year).toBe(target)

    const { data: auditRows } = await owner
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
