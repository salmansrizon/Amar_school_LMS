import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: attendance_events ingest RPC (token-gated, ADR 0001) + the daily
// reconciliation collapse (issue #10).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const RECONCILE_SECRET = process.env.RECONCILE_SECRET!
const PASSWORD = 'test-password-123!'
const DAY = '2026-07-01' // fixed historical date, isolated from other runs

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

function anon() {
  return createClient(URL, ANON, { auth: { persistSession: false } })
}

describe('RFID Attendance Event ingestion + reconciliation (issue #10)', () => {
  let ownerA: SupabaseClient
  let schoolId: string
  let ingestToken: string
  let employeeId: string
  let studentId: string
  let officeTimeId: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')

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
    await ownerA.from('employees').delete().eq('full_name', 'RFID Test Employee')
    await ownerA.from('students').delete().eq('full_name', 'RFID Test Student')
    await ownerA.from('office_times').delete().eq('name', 'RFID-Day')

    officeTimeId = (
      await ownerA
        .from('office_times')
        .insert({ name: 'RFID-Day', grace_minutes: 20, starts_at: '08:00', ends_at: '14:00' })
        .select('id')
        .single()
    ).data!.id
    employeeId = (
      await ownerA.from('employees').insert({ full_name: 'RFID Test Employee' }).select('id').single()
    ).data!.id
    await ownerA.from('employee_office_times').insert({ employee_id: employeeId, office_time_id: officeTimeId })
    studentId = (
      await ownerA.from('students').insert({ full_name: 'RFID Test Student' }).select('id').single()
    ).data!.id

    await ownerA.from('rfid_cards').delete().in('card_number', ['EMP-CARD-1', 'STU-CARD-1', 'LATE-CARD-9'])
    await ownerA.from('rfid_cards').insert([
      { card_number: 'EMP-CARD-1', employee_id: employeeId },
      { card_number: 'STU-CARD-1', student_id: studentId },
    ])
  })

  afterAll(async () => {
    await ownerA.from('attendance_records').delete().eq('att_date', DAY)
    await ownerA.from('employees').delete().eq('id', employeeId)
    await ownerA.from('students').delete().eq('id', studentId)
    await ownerA.from('office_times').delete().eq('id', officeTimeId)
  })

  it('rejects ingest with a wrong token', async () => {
    const { error } = await anon().rpc('ingest_attendance_events', {
      school: schoolId,
      token: '00000000-0000-0000-0000-000000000000',
      events: [{ card_number: 'EMP-CARD-1', tapped_at: `${DAY}T07:58:00Z` }],
    })
    expect(error).not.toBeNull()
  })

  it('accepts a direct device push (single event) and a bridge-agent batch', async () => {
    const push = await anon().rpc('ingest_attendance_events', {
      school: schoolId,
      token: ingestToken,
      events: [{ card_number: 'EMP-CARD-1', tapped_at: `${DAY}T07:58:00Z` }],
    })
    expect(push.error).toBeNull()
    expect(push.data).toBe(1)

    const batch = await anon().rpc('ingest_attendance_events', {
      school: schoolId,
      token: ingestToken,
      events: [
        { card_number: 'EMP-CARD-1', tapped_at: `${DAY}T09:30:00Z` },
        { card_number: 'EMP-CARD-1', tapped_at: `${DAY}T12:05:00Z` },
        { card_number: 'EMP-CARD-1', tapped_at: `${DAY}T13:00:00Z` },
        { card_number: 'STU-CARD-1', tapped_at: `${DAY}T08:05:00Z` },
        { card_number: 'STU-CARD-1', tapped_at: `${DAY}T12:45:00Z` },
      ],
    })
    expect(batch.error).toBeNull()
    expect(batch.data).toBe(5)
  })

  it('ingest alone does NOT create finalized records (reconciliation is scheduled)', async () => {
    const { data } = await ownerA.from('attendance_records').select('id').eq('att_date', DAY)
    expect(data).toEqual([])
  })

  it('reconciliation collapses 4 employee taps to one record: earliest entry, latest exit', async () => {
    const { error } = await anon().rpc('reconcile_attendance', {
      job_secret: RECONCILE_SECRET,
      target_date: DAY,
    })
    expect(error).toBeNull()

    const { data } = await ownerA
      .from('attendance_records')
      .select('entry_at, exit_at, status')
      .eq('att_date', DAY)
      .eq('person_type', 'employee')
      .eq('person_id', employeeId)
    expect(data).toHaveLength(1)
    expect(data![0].entry_at).toBe(`${DAY}T07:58:00+00:00`)
    expect(data![0].exit_at).toBe(`${DAY}T13:00:00+00:00`)
    // Entry 07:58 ≤ 08:00+20m grace; exit 13:00 < 14:00 → early exit only.
    expect(data![0].status).toBe('exit_early')
  })

  it('works for the Student too (no officeTime window → present)', async () => {
    const { data } = await ownerA
      .from('attendance_records')
      .select('entry_at, exit_at, status')
      .eq('att_date', DAY)
      .eq('person_type', 'student')
      .eq('person_id', studentId)
    expect(data).toHaveLength(1)
    expect(data![0].status).toBe('present')
  })

  it('re-running reconciliation is idempotent (still exactly one record each)', async () => {
    await anon().rpc('reconcile_attendance', { job_secret: RECONCILE_SECRET, target_date: DAY })
    const { data } = await ownerA.from('attendance_records').select('id').eq('att_date', DAY)
    expect(data).toHaveLength(2)
  })

  it('unregistered-card taps survive reconciliation and replay once the card is registered', async () => {
    // Tap from a card nobody has registered yet.
    await anon().rpc('ingest_attendance_events', {
      school: schoolId,
      token: ingestToken,
      events: [{ card_number: 'LATE-CARD-9', tapped_at: `${DAY}T08:10:00Z` }],
    })
    await anon().rpc('reconcile_attendance', { job_secret: RECONCILE_SECRET, target_date: DAY })

    // Not consumed: the tap is still unprocessed.
    const { data: pending } = await ownerA
      .from('attendance_events')
      .select('processed')
      .eq('card_number', 'LATE-CARD-9')
    expect(pending!.every((e) => e.processed === false)).toBe(true)

    // Register the card the next day, re-run — the tap replays into a record.
    const { data: lateStudent } = await ownerA
      .from('students')
      .insert({ full_name: 'RFID Late Card Student' })
      .select('id')
      .single()
    await ownerA.from('rfid_cards').insert({ card_number: 'LATE-CARD-9', student_id: lateStudent!.id })
    await anon().rpc('reconcile_attendance', { job_secret: RECONCILE_SECRET, target_date: DAY })

    const { data: record } = await ownerA
      .from('attendance_records')
      .select('status')
      .eq('person_id', lateStudent!.id)
      .eq('att_date', DAY)
    expect(record).toHaveLength(1)

    await ownerA.from('students').delete().eq('id', lateStudent!.id)
  })

  it('late-arriving taps after reconciliation widen the record instead of overwriting it (backfill)', async () => {
    // Device was offline during the day; it pushes a buffered tap after the
    // nightly reconcile already wrote entry=07:58 / exit=13:00 for the employee.
    await anon().rpc('ingest_attendance_events', {
      school: schoolId,
      token: ingestToken,
      events: [{ card_number: 'EMP-CARD-1', tapped_at: `${DAY}T14:30:00Z` }],
    })
    await anon().rpc('reconcile_attendance', { job_secret: RECONCILE_SECRET, target_date: DAY })

    const { data } = await ownerA
      .from('attendance_records')
      .select('entry_at, exit_at, status')
      .eq('att_date', DAY)
      .eq('person_type', 'employee')
      .eq('person_id', employeeId)
    expect(data).toHaveLength(1)
    expect(data![0].entry_at).toBe(`${DAY}T07:58:00+00:00`) // original entry kept
    expect(data![0].exit_at).toBe(`${DAY}T14:30:00+00:00`) // widened by the late tap
    expect(data![0].status).toBe('on_time') // exit now ≥ officeTime end 14:00 → no longer exit_early
  })

  it('rejects assigning a card to another school\'s student (cross-tenant)', async () => {
    const ownerB = await signedIn('owner-b@test.local')
    await ownerB.from('students').delete().eq('full_name', 'RFID XTenant Student')
    const { data: victim } = await ownerB
      .from('students')
      .insert({ full_name: 'RFID XTenant Student' })
      .select('id')
      .single()

    await ownerA.from('rfid_cards').delete().eq('card_number', 'XT-CARD-1')
    const { error } = await ownerA
      .from('rfid_cards')
      .insert({ card_number: 'XT-CARD-1', student_id: victim!.id })

    // Clean up BEFORE asserting so a failing run never strands a cross-tenant row.
    await ownerA.from('rfid_cards').delete().eq('card_number', 'XT-CARD-1')
    await ownerB.from('students').delete().eq('id', victim!.id)
    expect(error).not.toBeNull()
  })

  it('reconcile rejects a wrong secret', async () => {
    const { error } = await anon().rpc('reconcile_attendance', {
      job_secret: 'wrong-secret',
      target_date: DAY,
    })
    expect(error).not.toBeNull()
  })

  it('ingest skips malformed tapped_at instead of aborting the batch', async () => {
    const { error, data } = await anon().rpc('ingest_attendance_events', {
      school: schoolId,
      token: ingestToken,
      events: [
        { card_number: 'STU-CARD-1', tapped_at: `${DAY}T10:00:00Z` },
        { card_number: 'STU-CARD-1', tapped_at: 'not-a-timestamp' },
        { card_number: 'STU-CARD-1', tapped_at: null },
        { card_number: 'STU-CARD-1', tapped_at: `${DAY}T11:00:00Z` },
      ],
    })
    expect(error).toBeNull()
    expect(data).toBe(2) // only the two valid timestamps inserted
  })
})
