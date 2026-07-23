import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, anonClient } from '../helpers/auth'

// Seam: the per-school manual-attendance override switch (issue #30, PRD
// §5.3 — "de-activate automatic attendance"), and its effect on
// reconcile_attendance (migration 0047 re-points 0017's job).
const RECONCILE_SECRET = process.env.RECONCILE_SECRET!
const DAY = '2026-07-02' // fixed historical date, isolated from other runs

describe('Attendance II: manual-attendance override switch (issue #30)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let schoolIdA: string
  let originalEnabledA: boolean
  let ingestTokenA: string
  let cardNumber: string
  let studentId: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')

    const {
      data: { user },
    } = await ownerA.auth.getUser()
    const { data: profile } = await ownerA.from('profiles').select('school_id').eq('id', user!.id).single()
    schoolIdA = profile!.school_id
    const { data: school } = await ownerA
      .from('schools')
      .select('ingest_token, automatic_attendance_enabled')
      .eq('id', schoolIdA)
      .single()
    ingestTokenA = school!.ingest_token
    originalEnabledA = school!.automatic_attendance_enabled

    cardNumber = 'AUTOTOGGLE-CARD-1'
    await ownerA.from('attendance_events').delete().gte('tapped_at', `${DAY}T00:00:00Z`).lte('tapped_at', `${DAY}T23:59:59Z`)
    await ownerA.from('attendance_records').delete().eq('att_date', DAY)
    await ownerA.from('students').delete().eq('full_name', 'Attendance II Toggle Student')
    await ownerA.from('rfid_cards').delete().eq('card_number', cardNumber)

    studentId = (
      await ownerA.from('students').insert({ full_name: 'Attendance II Toggle Student' }).select('id').single()
    ).data!.id
    await ownerA.from('rfid_cards').insert({ card_number: cardNumber, student_id: studentId })
  })

  afterAll(async () => {
    await ownerA.from('attendance_events').delete().gte('tapped_at', `${DAY}T00:00:00Z`).lte('tapped_at', `${DAY}T23:59:59Z`)
    await ownerA.from('attendance_records').delete().eq('att_date', DAY)
    await ownerA.from('rfid_cards').delete().eq('card_number', cardNumber)
    await ownerA.from('students').delete().eq('id', studentId)
    // Restore the school's original flag so this test is repeatable/isolated.
    await ownerA.rpc('set_automatic_attendance_enabled', { enabled: originalEnabledA })
  })

  it('defaults to enabled (true) for an existing school', () => {
    expect(originalEnabledA).toBe(true)
  })

  it('an owner can switch it off via the RPC', async () => {
    const { error } = await ownerA.rpc('set_automatic_attendance_enabled', { enabled: false })
    expect(error).toBeNull()
    const { data: school } = await ownerA.from('schools').select('automatic_attendance_enabled').eq('id', schoolIdA).single()
    expect(school?.automatic_attendance_enabled).toBe(false)
  })

  it('the setter is self-scoped: it never reaches across schools', async () => {
    // The RPC takes no school id — it always resolves app_current_school_id()
    // for the caller, so there is no cross-tenant parameter to spoof. Confirm
    // School B is unaffected by School A's toggle above (still whatever it was).
    const { data: profileB } = await ownerB.auth.getUser()
    const { data: meB } = await ownerB.from('profiles').select('school_id').eq('id', profileB.user!.id).single()
    const { data: schoolBBefore } = await ownerB
      .from('schools')
      .select('automatic_attendance_enabled')
      .eq('id', meB!.school_id)
      .single()

    const { data: stillOffA } = await ownerA
      .from('schools')
      .select('automatic_attendance_enabled')
      .eq('id', schoolIdA)
      .single()
    expect(stillOffA?.automatic_attendance_enabled).toBe(false) // School A's own toggle stuck
    expect(schoolBBefore?.automatic_attendance_enabled).toBe(true) // School B untouched, still its default
  })

  it('reconcile_attendance skips a School with automatic attendance switched off', async () => {
    await anonClient().rpc('ingest_attendance_events', {
      school: schoolIdA,
      token: ingestTokenA,
      events: [{ card_number: cardNumber, tapped_at: `${DAY}T08:00:00Z` }],
    })
    await anonClient().rpc('reconcile_attendance', { job_secret: RECONCILE_SECRET, target_date: DAY })

    const { data: records } = await ownerA
      .from('attendance_records')
      .select('id')
      .eq('att_date', DAY)
      .eq('person_id', studentId)
    expect(records).toEqual([])

    // The raw tap stays unprocessed, ready to replay once re-enabled.
    const { data: events } = await ownerA
      .from('attendance_events')
      .select('processed')
      .eq('card_number', cardNumber)
    expect(events!.every((e) => e.processed === false)).toBe(true)
  })

  it('re-enabling lets the same unprocessed tap reconcile normally', async () => {
    await ownerA.rpc('set_automatic_attendance_enabled', { enabled: true })
    await anonClient().rpc('reconcile_attendance', { job_secret: RECONCILE_SECRET, target_date: DAY })

    const { data: records } = await ownerA
      .from('attendance_records')
      .select('status')
      .eq('att_date', DAY)
      .eq('person_id', studentId)
    expect(records).toHaveLength(1)
    expect(records![0].status).toBe('present')
  })
})
