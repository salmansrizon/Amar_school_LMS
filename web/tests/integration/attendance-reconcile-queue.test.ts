import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, anonClient } from '../helpers/auth'
import { enrollCard, unenrollCards } from '../helpers/machine-enroll'

// Machine Attendance Phase 3 slice 1 (baseline §15.2.1, migrations 0214/0215):
// School-local attendance day + the attendance_reconcile_dates queue.
// Seams: the legacy ingest RPC, drain_attendance_reconcile_queue (scoped to the
// test School with only_school), claim/complete for the mid-drain case, and the
// automatic-attendance toggle.
const RECONCILE_SECRET = process.env.RECONCILE_SECRET!

// Fixed dates of their own, isolated from the other attendance suites.
const D1 = '2026-09-10'
const D2 = '2026-09-11'
const OFF_DAY = '2026-09-12'
const MID_DAY = '2026-09-13'
const B_DAY = '2026-09-14'
const BACK_DAY = '2026-03-15' // a backdated tap, months later
const DATES = [D1, D2, OFF_DAY, MID_DAY, B_DAY, BACK_DAY]
const CARD_A = 'RQ-STU-A'
const CARD_B = 'RQ-STU-B'

type QueueRow = {
  status: string
  requested_at: string
  claimed_at: string | null
  attempts: number
  last_error: string | null
}

describe('School-local attendance day + reconcile queue (Machine Attendance Phase 3)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let schoolA: string
  let schoolB: string
  let tokenA: string
  let tokenB: string
  let studentA: string
  let studentB: string
  let originalEnabledA: boolean

  const schoolOf = async (owner: SupabaseClient) => {
    const { data: { user } } = await owner.auth.getUser()
    const { data: profile } = await owner.from('profiles').select('school_id').eq('id', user!.id).single()
    const { data: school } = await owner
      .from('schools')
      .select('id, ingest_token, automatic_attendance_enabled, time_zone')
      .eq('id', profile!.school_id)
      .single()
    return school!
  }

  const ingest = (school: string, token: string, events: { card_number: string; tapped_at: string }[]) =>
    anonClient().rpc('ingest_attendance_events', { school, token, events })

  const drain = (school: string) =>
    anonClient().rpc('drain_attendance_reconcile_queue', { job_secret: RECONCILE_SECRET, max_pairs: 1000, only_school: school })

  const queueRow = async (owner: SupabaseClient, school: string, day: string): Promise<QueueRow | null> => {
    const { data, error } = await owner
      .from('attendance_reconcile_dates')
      .select('status, requested_at, claimed_at, attempts, last_error')
      .eq('school_id', school)
      .eq('attendance_date', day)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data
  }

  const records = async (owner: SupabaseClient, person: string, day: string) => {
    const { data } = await owner
      .from('attendance_records')
      .select('att_date, entry_at, exit_at, status')
      .eq('person_id', person)
      .eq('att_date', day)
    return data ?? []
  }

  const events = async (owner: SupabaseClient, card: string) => {
    const { data } = await owner
      .from('attendance_events')
      .select('tapped_at, attendance_date, processed')
      .eq('card_number', card)
      .order('tapped_at')
    return data ?? []
  }

  const clean = async () => {
    for (const [owner, card] of [[ownerA, CARD_A], [ownerB, CARD_B]] as const) {
      await owner.from('attendance_events').delete().eq('card_number', card)
      await owner.from('attendance_records').delete().in('att_date', DATES)
    }
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    const a = await schoolOf(ownerA)
    const b = await schoolOf(ownerB)
    schoolA = a.id
    tokenA = a.ingest_token
    originalEnabledA = a.automatic_attendance_enabled
    schoolB = b.id
    tokenB = b.ingest_token
    if (!originalEnabledA) await ownerA.rpc('set_automatic_attendance_enabled', { enabled: true })
    if (!b.automatic_attendance_enabled) throw new Error('fixture School B must have automatic attendance on')

    await clean()
    await ownerA.from('students').delete().eq('full_name', 'Reconcile Queue Student A')
    await ownerB.from('students').delete().eq('full_name', 'Reconcile Queue Student B')
    await unenrollCards(ownerA, [CARD_A])
    await unenrollCards(ownerB, [CARD_B])
    studentA = (await ownerA.from('students').insert({ full_name: 'Reconcile Queue Student A' }).select('id').single()).data!.id
    studentB = (await ownerB.from('students').insert({ full_name: 'Reconcile Queue Student B' }).select('id').single()).data!.id
    expect((await enrollCard(ownerA, { student_id: studentA }, CARD_A)).error).toBeNull()
    expect((await enrollCard(ownerB, { student_id: studentB }, CARD_B)).error).toBeNull()

    // Start from a drained queue for both test Schools.
    await drain(schoolA)
    await drain(schoolB)
  })

  afterAll(async () => {
    await ownerA.rpc('set_automatic_attendance_enabled', { enabled: originalEnabledA })
    await clean()
    // Leave the pairs this suite touched 'done' rather than pending on the shared queue.
    await drain(schoolA)
    await drain(schoolB)
    await unenrollCards(ownerA, [CARD_A])
    await unenrollCards(ownerB, [CARD_B])
    await ownerA.from('students').delete().eq('id', studentA)
    await ownerB.from('students').delete().eq('id', studentB)
  })

  it('every School has a valid IANA time zone, Asia/Dhaka by default', async () => {
    expect((await schoolOf(ownerA)).time_zone).toBe('Asia/Dhaka')
    expect((await schoolOf(ownerB)).time_zone).toBe('Asia/Dhaka')
  })

  it('assigns taps to the Asia/Dhaka local day, not the UTC day', async () => {
    const { data, error } = await ingest(schoolA, tokenA, [
      { card_number: CARD_A, tapped_at: '2026-09-09T23:30:00Z' }, // 05:30 on 10 Sep in Dhaka
      { card_number: CARD_A, tapped_at: '2026-09-10T17:59:00Z' }, // 23:59 on 10 Sep in Dhaka
      { card_number: CARD_A, tapped_at: '2026-09-10T18:00:00Z' }, // 00:00 on 11 Sep in Dhaka
    ])
    expect(error).toBeNull()
    expect(data).toBe(3)
    expect((await events(ownerA, CARD_A)).map((e) => e.attendance_date)).toEqual([D1, D1, D2])

    expect((await drain(schoolA)).error).toBeNull()
    const day1 = await records(ownerA, studentA, D1)
    expect(day1).toHaveLength(1)
    expect(day1[0].entry_at).toBe('2026-09-09T23:30:00+00:00') // previous UTC day, same local day
    expect(day1[0].exit_at).toBe('2026-09-10T17:59:00+00:00')
    const day2 = await records(ownerA, studentA, D2)
    expect(day2).toHaveLength(1)
    expect(day2[0].entry_at).toBe('2026-09-10T18:00:00+00:00')
  })

  it('legacy RFID ingest is unchanged: token gate, card-only rows, malformed skipped, duplicates inserted', async () => {
    const bad = await ingest(schoolA, '00000000-0000-0000-0000-000000000000', [{ card_number: CARD_A, tapped_at: `${D1}T08:00:00Z` }])
    expect(bad.error).not.toBeNull()

    const before = (await events(ownerA, CARD_A)).length
    const { data, error } = await ingest(schoolA, tokenA, [
      { card_number: CARD_A, tapped_at: `${D1}T08:00:00Z` },
      { card_number: CARD_A, tapped_at: `${D1}T08:00:00Z` }, // exact duplicate: legacy path has no dedupe
      { card_number: '', tapped_at: `${D1}T08:00:00Z` },
      { card_number: CARD_A, tapped_at: 'not-a-timestamp' },
    ])
    expect(error).toBeNull()
    expect(data).toBe(2)
    expect((await events(ownerA, CARD_A)).length).toBe(before + 2)
    await drain(schoolA)
  })

  it('every ingest enqueues the touched pair as pending', async () => {
    await ingest(schoolA, tokenA, [{ card_number: CARD_A, tapped_at: `${D1}T09:00:00Z` }])
    const row = await queueRow(ownerA, schoolA, D1)
    expect(row?.status).toBe('pending')
    await drain(schoolA)
    expect((await queueRow(ownerA, schoolA, D1))?.status).toBe('done')
  })

  it('a duplicate ingest still re-pends a done pair with a newer requested_at', async () => {
    const done = (await queueRow(ownerA, schoolA, D1))!
    expect(done.status).toBe('done')
    await ingest(schoolA, tokenA, [{ card_number: CARD_A, tapped_at: `${D1}T09:00:00Z` }]) // same tap again
    const again = (await queueRow(ownerA, schoolA, D1))!
    expect(again.status).toBe('pending')
    expect(new Date(again.requested_at).getTime()).toBeGreaterThan(new Date(done.requested_at).getTime())
    await drain(schoolA)
    expect(await records(ownerA, studentA, D1)).toHaveLength(1)
  })

  it('a late, backdated tap enqueues its own historical date and reconciles into it', async () => {
    await ingest(schoolA, tokenA, [{ card_number: CARD_A, tapped_at: `${BACK_DAY}T04:00:00Z` }])
    expect((await queueRow(ownerA, schoolA, BACK_DAY))?.status).toBe('pending')
    await drain(schoolA)
    expect((await queueRow(ownerA, schoolA, BACK_DAY))?.status).toBe('done')
    const back = await records(ownerA, studentA, BACK_DAY)
    expect(back).toHaveLength(1)
    expect(back[0].entry_at).toBe(`${BACK_DAY}T04:00:00+00:00`)
  })

  it('the drain reconciles due pairs and marks them done; taps become processed', async () => {
    const result = await drain(schoolA)
    expect(result.error).toBeNull()
    expect(result.data).toMatchObject({ failed: 0 })
    for (const day of [D1, D2, BACK_DAY]) expect((await queueRow(ownerA, schoolA, day))?.status).toBe('done')
    expect((await events(ownerA, CARD_A)).every((e) => e.processed)).toBe(true)
  })

  it('a request that arrives after the claim is not lost', async () => {
    await ingest(schoolA, tokenA, [{ card_number: CARD_A, tapped_at: `${MID_DAY}T03:00:00Z` }])
    const claim = await anonClient().rpc('claim_attendance_reconcile_dates', {
      job_secret: RECONCILE_SECRET,
      max_pairs: 1000,
      only_school: schoolA,
    })
    expect(claim.error).toBeNull()
    const mine = (claim.data as { school_id: string; attendance_date: string; claimed_at: string }[]).find(
      (p) => p.attendance_date === MID_DAY,
    )!
    expect(mine).toBeDefined()
    expect((await queueRow(ownerA, schoolA, MID_DAY))?.status).toBe('processing')

    // The worker reconciles what it saw…
    await anonClient().rpc('reconcile_attendance', { job_secret: RECONCILE_SECRET, target_school: schoolA, target_date: MID_DAY })
    // …while a new tap for the same pair lands before it completes.
    await ingest(schoolA, tokenA, [{ card_number: CARD_A, tapped_at: `${MID_DAY}T11:00:00Z` }])
    const midRun = (await queueRow(ownerA, schoolA, MID_DAY))!
    expect(midRun.status).toBe('pending')
    expect(new Date(midRun.requested_at).getTime()).toBeGreaterThan(new Date(mine.claimed_at).getTime())

    const completed = await anonClient().rpc('complete_attendance_reconcile_date', {
      job_secret: RECONCILE_SECRET,
      target_school: schoolA,
      target_date: MID_DAY,
      claimed_at_token: mine.claimed_at,
      outcome: 'done',
    })
    expect(completed.error).toBeNull()
    expect(completed.data).toBe('pending') // not 'done': the newer request wins
    expect((await queueRow(ownerA, schoolA, MID_DAY))?.status).toBe('pending')

    // Release the other pairs this claim took, then the next drain picks the new tap up.
    for (const p of claim.data as { attendance_date: string; claimed_at: string }[]) {
      if (p.attendance_date === MID_DAY) continue
      await anonClient().rpc('complete_attendance_reconcile_date', {
        job_secret: RECONCILE_SECRET,
        target_school: schoolA,
        target_date: p.attendance_date,
        claimed_at_token: p.claimed_at,
        outcome: 'pending',
      })
    }
    await drain(schoolA)
    expect((await queueRow(ownerA, schoolA, MID_DAY))?.status).toBe('done')
    const mid = await records(ownerA, studentA, MID_DAY)
    expect(mid).toHaveLength(1)
    expect(mid[0].entry_at).toBe(`${MID_DAY}T03:00:00+00:00`)
    expect(mid[0].exit_at).toBe(`${MID_DAY}T11:00:00+00:00`)
  })

  it('automatic attendance switched off: the pair is skipped and its taps stay unprocessed', async () => {
    expect((await ownerA.rpc('set_automatic_attendance_enabled', { enabled: false })).error).toBeNull()
    await ingest(schoolA, tokenA, [{ card_number: CARD_A, tapped_at: `${OFF_DAY}T03:00:00Z` }])
    await drain(schoolA)
    expect((await queueRow(ownerA, schoolA, OFF_DAY))?.status).toBe('skipped')
    expect(await records(ownerA, studentA, OFF_DAY)).toHaveLength(0)
    const off = (await events(ownerA, CARD_A)).filter((e) => e.attendance_date === OFF_DAY)
    expect(off.every((e) => !e.processed)).toBe(true)
  })

  it('re-enabling re-pends the skipped pair, and the next drain reconciles it', async () => {
    expect((await ownerA.rpc('set_automatic_attendance_enabled', { enabled: true })).error).toBeNull()
    expect((await queueRow(ownerA, schoolA, OFF_DAY))?.status).toBe('pending')
    await drain(schoolA)
    expect((await queueRow(ownerA, schoolA, OFF_DAY))?.status).toBe('done')
    expect(await records(ownerA, studentA, OFF_DAY)).toHaveLength(1)
  })

  it('reconciling the same pair again is merge-safe: one record, window unchanged', async () => {
    const before = await records(ownerA, studentA, D1)
    for (let i = 0; i < 2; i++) {
      const r = await anonClient().rpc('reconcile_attendance', { job_secret: RECONCILE_SECRET, target_school: schoolA, target_date: D1 })
      expect(r.error).toBeNull()
    }
    expect((await anonClient().rpc('enqueue_attendance_reconcile_dates', { job_secret: RECONCILE_SECRET, target_date: D1, target_school: schoolA })).data).toBe(1)
    await drain(schoolA)
    expect(await records(ownerA, studentA, D1)).toEqual(before)
  })

  it('Schools are isolated: draining School A leaves School B pending and unread by A', async () => {
    await ingest(schoolB, tokenB, [{ card_number: CARD_B, tapped_at: `${B_DAY}T03:00:00Z` }])
    await ingest(schoolA, tokenA, [{ card_number: CARD_A, tapped_at: `${B_DAY}T03:00:00Z` }])

    await drain(schoolA)
    expect((await queueRow(ownerA, schoolA, B_DAY))?.status).toBe('done')
    expect((await queueRow(ownerB, schoolB, B_DAY))?.status).toBe('pending')
    expect((await events(ownerB, CARD_B)).every((e) => !e.processed)).toBe(true)
    // RLS: School A's owner cannot see School B's queue rows.
    expect(await queueRow(ownerA, schoolB, B_DAY)).toBeNull()
    // A tap from B's token never lands on A's queue, and B's card never resolves for A.
    expect(await records(ownerA, studentB, B_DAY)).toHaveLength(0)

    await drain(schoolB)
    expect((await queueRow(ownerB, schoolB, B_DAY))?.status).toBe('done')
    expect(await records(ownerB, studentB, B_DAY)).toHaveLength(1)
  })

  it('manual backfill (?date=) enqueues only; it reconciles nothing by itself', async () => {
    await ingest(schoolA, tokenA, [{ card_number: CARD_A, tapped_at: `${D2}T04:00:00Z` }])
    await drain(schoolA)
    const r = await anonClient().rpc('enqueue_attendance_reconcile_dates', { job_secret: RECONCILE_SECRET, target_date: D2, target_school: schoolA })
    expect(r.error).toBeNull()
    expect((await queueRow(ownerA, schoolA, D2))?.status).toBe('pending')
    await drain(schoolA)
    expect((await queueRow(ownerA, schoolA, D2))?.status).toBe('done')
  })

  it('the job RPCs and the queue table are closed to everyone without the secret', async () => {
    const wrong = 'wrong-secret'
    for (const [fn, args] of [
      ['drain_attendance_reconcile_queue', { job_secret: wrong }],
      ['claim_attendance_reconcile_dates', { job_secret: wrong, max_pairs: 1 }],
      ['enqueue_attendance_reconcile_dates', { job_secret: wrong, target_date: D1 }],
      ['reconcile_attendance', { job_secret: wrong, target_school: schoolA, target_date: D1 }],
      ['complete_attendance_reconcile_date', { job_secret: wrong, target_school: schoolA, target_date: D1, claimed_at_token: new Date().toISOString(), outcome: 'done' }],
    ] as const) {
      expect((await anonClient().rpc(fn, args)).error, fn).not.toBeNull()
    }
    // Internal helpers are not callable at all.
    expect((await anonClient().rpc('_reconcile_attendance_pair', { target_school: schoolA, target_date: D1 })).error).not.toBeNull()
    // Owners can read their queue but not write it.
    await ownerA.from('attendance_reconcile_dates').update({ status: 'done' }).eq('school_id', schoolA).eq('attendance_date', D1)
    await ownerA.from('attendance_reconcile_dates').insert({ school_id: schoolA, attendance_date: '2026-09-30' })
    expect(await queueRow(ownerA, schoolA, '2026-09-30')).toBeNull()
  })

  it('the two-argument reconcile_attendance deployed code still calls keeps working', async () => {
    await ingest(schoolA, tokenA, [{ card_number: CARD_A, tapped_at: `${D2}T09:00:00Z` }])
    const r = await anonClient().rpc('reconcile_attendance', { job_secret: RECONCILE_SECRET, target_date: D2 })
    expect(r.error).toBeNull()
    const day2 = await records(ownerA, studentA, D2)
    expect(day2).toHaveLength(1)
    expect(day2[0].exit_at).toBe(`${D2}T09:00:00+00:00`)
  })
})
