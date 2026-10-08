import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, anonClient } from '../helpers/auth'
import { enrollCard, unenrollCards } from '../helpers/machine-enroll'

// Seam: ad_hoc_grace_exemptions/ad_hoc_grace_exemption_categories (issue
// #671, ADR 0030) — a dated, one-off addition to the Considerable Grace
// Window's MAX rule, and its real effect on reconcile_attendance's computed
// status for the target date. office_times/employee_office_times are
// otherwise-retired infrastructure (ADR 0030) but still exercised here as a
// fixture, since without SOME office_start/office_end the status is always
// 'present' regardless of grace — this test needs a non-trivial window to
// observe the exemption actually widening it.
const RECONCILE_SECRET = process.env.RECONCILE_SECRET!
const DAY = '2026-08-01' // fixed historical date, isolated from other runs

// Reconcile DAY for one School the way the cron route now does (migration 0215):
// mark the (School, day) pair due, then drain the queue for that School.
const reconcileDay = async (school: string) => {
  await anonClient().rpc('enqueue_attendance_reconcile_dates', { job_secret: RECONCILE_SECRET, target_date: DAY, target_school: school })
  return anonClient().rpc('drain_attendance_reconcile_queue', { job_secret: RECONCILE_SECRET, only_school: school })
}

// A canonical Employee Category (issue #666's fixed, global, seeded list) —
// employee_categories is Super-Admin-write-only (ADR 0028), so a test can't
// insert its own category; it must use one of the 20 already there. Only
// this test's own Employee/exemption rows touch it, and no other
// integration test gives Teacher a Standing Grace Rule, so there's no
// shared-state risk.
const TEST_CATEGORY = 'Teacher'

describe('Ad-Hoc Grace Exemption (issue #671)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let schoolId: string
  let ingestToken: string
  let employeeId: string
  let officeTimeId: string
  let exemptionId: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')

    const {
      data: { user },
    } = await ownerA.auth.getUser()
    const { data: profile } = await ownerA.from('profiles').select('school_id').eq('id', user!.id).single()
    schoolId = profile!.school_id
    const { data: school } = await ownerA.from('schools').select('ingest_token').eq('id', schoolId).single()
    ingestToken = school!.ingest_token

    // Clean prior runs.
    await ownerA.from('attendance_events').delete().gte('tapped_at', `${DAY}T00:00:00Z`).lte('tapped_at', `${DAY}T23:59:59Z`)
    await ownerA.from('attendance_records').delete().eq('att_date', DAY)
    await ownerA.from('employees').delete().eq('full_name', 'Ad-Hoc Grace Test Employee')
    await ownerA.from('office_times').delete().eq('name', 'AdHoc-Day')
    await unenrollCards(ownerA, ['ADHOC-CARD-1'])

    officeTimeId = (
      await ownerA
        .from('office_times')
        .insert({ name: 'AdHoc-Day', starts_at: '08:00', ends_at: '16:00' })
        .select('id')
        .single()
    ).data!.id
    employeeId = (
      await ownerA
        .from('employees')
        .insert({ full_name: 'Ad-Hoc Grace Test Employee', category: TEST_CATEGORY })
        .select('id')
        .single()
    ).data!.id
    await ownerA.from('employee_office_times').insert({ employee_id: employeeId, office_time_id: officeTimeId })
    await enrollCard(ownerA, { employee_id: employeeId }, 'ADHOC-CARD-1')
  })

  afterAll(async () => {
    await ownerA.from('attendance_records').delete().eq('att_date', DAY)
    await unenrollCards(ownerA, ['ADHOC-CARD-1'])
    await ownerA.from('employees').delete().eq('id', employeeId)
    await ownerA.from('employee_office_times').delete().eq('employee_id', employeeId)
    await ownerA.from('office_times').delete().eq('id', officeTimeId)
    if (exemptionId) await ownerA.from('ad_hoc_grace_exemptions').delete().eq('id', exemptionId)
  })

  it('with no grace configured, an entry past office_start reads late', async () => {
    await anonClient().rpc('ingest_attendance_events', {
      school: schoolId,
      token: ingestToken,
      events: [{ card_number: 'ADHOC-CARD-1', tapped_at: `${DAY}T08:30:00Z` }],
    })
    await reconcileDay(schoolId)

    const { data } = await ownerA
      .from('attendance_records')
      .select('status')
      .eq('att_date', DAY)
      .eq('person_type', 'employee')
      .eq('person_id', employeeId)
    expect(data).toHaveLength(1)
    expect(data![0].status).toBe('late_entry')
  })

  it('rejects an exemption category that is not a known Employee Category', async () => {
    const { data: exemption } = await ownerA
      .from('ad_hoc_grace_exemptions')
      .insert({ exemption_date: DAY, duration_minutes: 45, details: 'FK test' })
      .select('id')
      .single()
    const { error } = await ownerA
      .from('ad_hoc_grace_exemption_categories')
      .insert({ exemption_id: exemption!.id, category: 'not-a-real-category' })
    expect(error).not.toBeNull()
    await ownerA.from('ad_hoc_grace_exemptions').delete().eq('id', exemption!.id)
  })

  it('an exemption carries a Shift, and deleting it removes its category rows (issue #673)', async () => {
    const { data: exemption, error } = await ownerA
      .from('ad_hoc_grace_exemptions')
      .insert({ exemption_date: DAY, duration_minutes: 5, details: 'Shift test', shift: 'Morning' })
      .select('id, shift')
      .single()
    expect(error).toBeNull()
    expect(exemption!.shift).toBe('Morning')
    await ownerA.from('ad_hoc_grace_exemption_categories').insert({ exemption_id: exemption!.id, category: TEST_CATEGORY })

    await ownerA.from('ad_hoc_grace_exemptions').delete().eq('id', exemption!.id)
    const { data: orphans } = await ownerA
      .from('ad_hoc_grace_exemption_categories')
      .select('category')
      .eq('exemption_id', exemption!.id)
    expect(orphans).toEqual([])
  })

  it("another School's Owner cannot see the exemption once created", async () => {
    const { data: exemption } = await ownerA
      .from('ad_hoc_grace_exemptions')
      .insert({ exemption_date: DAY, duration_minutes: 45, details: 'Institutional meeting ran into lunch' })
      .select('id')
      .single()
    exemptionId = exemption!.id
    await ownerA.from('ad_hoc_grace_exemption_categories').insert({ exemption_id: exemptionId, category: TEST_CATEGORY })

    const { data: foreignRead } = await ownerB.from('ad_hoc_grace_exemptions').select('id').eq('id', exemptionId)
    expect(foreignRead).toEqual([])
  })

  it("re-reconciling the same date now reads on_time — the exemption widened that category's grace", async () => {
    // 45 minutes of Ad-Hoc grace on top of office_start 08:00 covers the
    // 08:30 entry that read late_entry before the exemption existed.
    // reconcile_attendance only picks up unprocessed taps, so re-tap at the
    // same time to give it something to recompute (merged with the existing
    // record, entry stays 08:30).
    await anonClient().rpc('ingest_attendance_events', {
      school: schoolId,
      token: ingestToken,
      events: [{ card_number: 'ADHOC-CARD-1', tapped_at: `${DAY}T08:30:00Z` }],
    })
    await reconcileDay(schoolId)

    const { data } = await ownerA
      .from('attendance_records')
      .select('status')
      .eq('att_date', DAY)
      .eq('person_type', 'employee')
      .eq('person_id', employeeId)
    expect(data).toHaveLength(1)
    expect(data![0].status).toBe('on_time')
  })
})
