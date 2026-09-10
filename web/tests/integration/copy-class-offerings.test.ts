import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { signedIn, PASSWORD } from '../helpers/auth'
import { ensureStaffLogin } from '../helpers/staff'
import { schoolFixtures } from '../helpers/school-fixture'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// copy_class_offerings_to_active_year (map #609, ticket #616 / T7) -- the
// "Copy Classes from year N" named domain action: School Owner only, clones a
// *started* prior Academic Year's Class Offerings into the School's current
// active_academic_year. Offering-intrinsic columns only (name, section,
// shift, group_department, education_level); class_teacher_id lands null;
// nothing relational is carried. Atomic (for update on the school row),
// idempotent and concurrency-safe via class_offerings_identity_unique +
// on conflict do nothing. Never mutates source rows or
// schools.active_academic_year.
//
// Harness mirrors start-academic-year.test.ts exactly, and for the same
// reasons: active_academic_year is forward-only with no undo, so every
// assertion runs against a disposable, isolated School (schoolFixtures,
// #541) that afterAll drops. A genuine School Owner session is required --
// the RPC checks app_current_role() = 'school_owner' against the CALLER's
// own profile -- so it is minted the only way a brand-new School can: real
// signup + redeem_school_claim_code. A project with signup confirmation on,
// or an exhausted signup rate limit, yields no session and the Owner-scoped
// assertions skip rather than touch a shared fixture School.
async function freshSignedUpUser(): Promise<SupabaseClient | null> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const email = `zz-cco-${crypto.randomUUID().slice(0, 12)}@example.com`
  const { data, error } = await client.auth.signUp({ email, password: PASSWORD })
  if (error || !data.session) return null
  return client
}

interface CopyRow {
  copied: number
  skipped: number
}

describe('copy_class_offerings_to_active_year (#609, #616)', () => {
  let admin: SupabaseClient
  let staff: SupabaseClient
  let fresh: SupabaseClient | null
  let schoolId: string
  let initialYear: number | null
  let sourceYear: number
  let year1: number // active year after the first start_academic_year

  const schools = schoolFixtures(() => admin)

  const offeringsIn = async (year: number) => {
    const { data } = await admin
      .from('class_offerings')
      .select('name, section, shift, group_department, education_level, academic_year, class_teacher_id')
      .eq('school_id', schoolId)
      .eq('academic_year', year)
      .order('name')
    return data ?? []
  }

  const copy = (from: number) =>
    fresh!.rpc('copy_class_offerings_to_active_year', { p_source_year: from })

  beforeAll(async () => {
    admin = await signedIn('super@test.local')

    // Non-owner caller for the rejection check -- kept on owner-a's existing
    // shared School deliberately: the RPC raises on the role check before any
    // row is written, so this never mutates that fixture.
    const ownerA = await signedIn('owner-a@test.local')
    await ensureStaffLogin(ownerA, { email: 'cco-staff@test.local', fullName: 'CCO Staff', screens: ['institute'] })
    staff = await signedIn('cco-staff@test.local', PASSWORD)

    schoolId = await schools.create({ name: `ZZ Copy Classes ${crypto.randomUUID().slice(0, 8)}` })
    const { data: school } = await admin
      .from('schools')
      .select('active_academic_year')
      .eq('id', schoolId)
      .single()
    initialYear = school!.active_academic_year

    fresh = await freshSignedUpUser()
    if (fresh) {
      const { data: code } = await admin.rpc('generate_school_claim_code', { sid: schoolId })
      const { error } = await fresh.rpc('redeem_school_claim_code', {
        code_text: (code as { code: string }).code,
        desired_subdomain: `zz-cco-${crypto.randomUUID().slice(0, 6)}`,
      })
      if (error) throw new Error(error.message)

      // Advance once so there is a *started* year strictly older than the
      // active one to copy from. start_academic_year (#610) records both the
      // year left and the year entered in school_academic_years, so after
      // this call {initialYear, year1} are both started and initialYear is a
      // valid copy source.
      sourceYear = initialYear!
      year1 = initialYear! + 1
      const { error: adv } = await fresh.rpc('start_academic_year', { p_year: year1 })
      if (adv) throw new Error(adv.message)
    }
  })

  afterAll(schools.cleanup)

  it('rejects a non-owner (Staff User) caller', async () => {
    const { error } = await staff.rpc('copy_class_offerings_to_active_year', { p_source_year: 2000 })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/School Owner only/)
  })

  it('rejects a source year that was never started', async () => {
    if (!fresh) return
    const { error } = await copy(1990)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/was never started/)
  })

  it('rejects a source year that is not older than the active academic year', async () => {
    if (!fresh) return
    // year1 IS a started year (it is the one the School is currently on), so
    // this gets past the "never started" guard and trips the ordering one.
    const { error } = await copy(year1)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/older than the active academic year/)
  })

  it('copies every source Offering missing in the active year; copied = count, skipped = 0', async () => {
    if (!fresh) return
    const src = [
      { name: 'Six', section: 'A', shift: 'Morning', group_department: null, education_level: 'Junior' },
      { name: 'Seven', section: 'B', shift: null, group_department: null, education_level: 'Junior' },
      { name: 'Ten', section: 'A', shift: 'Day', group_department: 'Science', education_level: 'Secondary' },
    ]
    const { error: insErr } = await admin
      .from('class_offerings')
      .insert(src.map((r) => ({ ...r, school_id: schoolId, academic_year: sourceYear })))
    expect(insErr).toBeNull()

    const { data, error } = await copy(sourceYear)
    expect(error).toBeNull()
    const row = (data as CopyRow[])[0]
    expect(row).toEqual({ copied: 3, skipped: 0 })

    // The three rows now exist under the active year, shape carried across,
    // class_teacher_id null, academic_year = active.
    const copied = await offeringsIn(year1)
    expect(copied.map((c) => `${c.name}/${c.section}/${c.shift ?? ''}/${c.group_department ?? ''}/${c.education_level ?? ''}`))
      .toEqual(['Seven/B///Junior', 'Six/A/Morning//Junior', 'Ten/A/Day/Science/Secondary'])
    expect(copied.every((c) => c.class_teacher_id === null)).toBe(true)
    expect(copied.every((c) => c.academic_year === year1)).toBe(true)

    // Source rows are byte-unchanged.
    const stillSource = await offeringsIn(sourceYear)
    expect(stillSource).toHaveLength(3)
    expect(stillSource.every((c) => c.academic_year === sourceYear)).toBe(true)
    expect(stillSource.every((c) => c.class_teacher_id === null)).toBe(true)
  })

  it('a second run is a no-op: copied = 0, every source row counts as skipped', async () => {
    if (!fresh) return
    const { data, error } = await copy(sourceYear)
    expect(error).toBeNull()
    expect((data as CopyRow[])[0]).toEqual({ copied: 0, skipped: 3 })
    // No new rows -- still exactly the three from the first run.
    expect(await offeringsIn(year1)).toHaveLength(3)
  })

  it('an Offering already present in the active year is skipped, not duplicated', async () => {
    if (!fresh) return
    // Add a fourth source Offering; the other three already exist in year1.
    const { error: insErr } = await admin.from('class_offerings').insert({
      school_id: schoolId,
      name: 'Nine',
      section: 'C',
      shift: null,
      group_department: null,
      education_level: 'Secondary',
      academic_year: sourceYear,
    })
    expect(insErr).toBeNull()

    const { data, error } = await copy(sourceYear)
    expect(error).toBeNull()
    expect((data as CopyRow[])[0]).toEqual({ copied: 1, skipped: 3 })
    expect(await offeringsIn(year1)).toHaveLength(4)
  })

  it('works across a multi-year gap between the started source year and the active year', async () => {
    if (!fresh) return
    const year2 = year1 + 5
    const { error: adv } = await fresh.rpc('start_academic_year', { p_year: year2 })
    expect(adv).toBeNull()

    const { data, error } = await copy(sourceYear)
    expect(error).toBeNull()
    // All four source rows land in the new active year; none existed there.
    expect((data as CopyRow[])[0]).toEqual({ copied: 4, skipped: 0 })
    const landed = await offeringsIn(year2)
    expect(landed).toHaveLength(4)
    expect(landed.every((c) => c.class_teacher_id === null && c.academic_year === year2)).toBe(true)
  })

  it('records the copy in audit_log and touches no table other than class_offerings', async () => {
    if (!fresh) return

    const { data: audit } = await admin
      .from('audit_log')
      .select('before, after')
      .eq('entity_type', 'school')
      .eq('entity_id', schoolId)
      .eq('action', 'configure')
      .order('created_at', { ascending: false })
    const copyRows = (audit ?? []).filter(
      (a) => (a.before as Record<string, unknown>)?.copy_class_offerings_from !== undefined,
    )
    expect(copyRows.length).toBeGreaterThan(0)
    expect((copyRows[0].after as { copied: number }).copied).toBeGreaterThanOrEqual(0)

    // Disposable School: the copy never creates a student, an enrollment, a
    // subject or a fee structure.
    for (const table of ['student_enrollments', 'subjects', 'fee_structures'] as const) {
      const { count } = await admin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
      expect(count ?? 0).toBe(0)
    }
  })

  // "no active academic year set" -> refused: the RPC guards it, but a fresh
  // School always picks up the current-calendar-year column default (0182)
  // at insert time and active_academic_year cannot be set back to null (the
  // 0194 transition trigger blocks even a raw UPDATE), so it is not a
  // reachable state to exercise here -- same stance start-academic-year.test.ts
  // takes on its own null-year branch.
})
