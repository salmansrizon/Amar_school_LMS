import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, anonClient } from '../helpers/auth'
import { schoolFixtures } from '../helpers/school-fixture'

// Machine Attendance Phase 3 (migration 0263, ADR 0033): the per-(School, day)
// reconcile resolves Attendance Agent events ONLY through the enrollment
// episode of the event's own (machine_id, machine_user_id) whose window
// [linked_at, unlinked_at) contains the punch. Legacy card taps keep resolving
// by card. Everything runs on a disposable School (Asia/Dhaka); Agent events
// and episodes are written by Super Admin, standing in for the Phase 8 ingest
// and the Phase 9/10 provisioning.

const RECONCILE_SECRET = process.env.RECONCILE_SECRET!
const at = (day: string, hhmm: string) => `${day}T${hhmm}:00+00:00` // UTC; 02:00Z = 08:00 Dhaka, same local day

describe('reconcile resolves Agent events through enrollment episodes (Machine Attendance Phase 3)', () => {
  let admin: SupabaseClient
  let school: string
  let agent: string
  let m1: string
  let m2: string
  let s1: string
  let s2: string
  let e1: string
  let s1UniqueId: number
  let userSeq = 0
  const schools = schoolFixtures(() => admin)

  const nextUser = () => `8888${String(1000 + ++userSeq)}`

  const episode = async (row: Record<string, unknown>) => {
    const { error } = await admin
      .from('attendance_machine_enrollments')
      .insert({ school_id: school, machine_id: m1, entity_type: 'student', student_id: s1, ...row })
    if (error) throw new Error(error.message)
  }

  /** An Agent event as the Phase 8 ingest will store it (tapped_at is the authoritative UTC). */
  const agentEvent = async (machineUserId: string, tappedAt: string, row: Record<string, unknown> = {}) => {
    const { data, error } = await admin
      .from('attendance_events')
      .insert({
        school_id: school, source: 'agent', agent_id: agent, machine_id: m1, machine_user_id: machineUserId,
        event_key: `k-${randomUUID()}`, tapped_at: tappedAt,
        device_local_time: tappedAt.slice(0, 19), device_time_zone: 'Asia/Dhaka', verify_mode: '3', punch_state: '0',
        ...row,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data.id as string
  }

  const reconcile = (day: string) =>
    anonClient().rpc('reconcile_attendance', { job_secret: RECONCILE_SECRET, target_school: school, target_date: day })

  const record = async (personId: string, day: string) =>
    (await admin.from('attendance_records').select('person_type, entry_at, exit_at, status').eq('person_id', personId).eq('att_date', day).maybeSingle()).data

  const processed = async (eventId: string) =>
    (await admin.from('attendance_events').select('processed').eq('id', eventId).single()).data!.processed as boolean

  const machine = async (serial: string) => {
    const { data, error } = await admin
      .from('attendance_machines')
      .insert({ school_id: school, machine_type: 'timmy', model: 'TM52GPRS', serial_number: serial, location: 'Resolution Gate', shift_scope: 'none', agent_id: agent })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data.id as string
  }

  const person = async (table: 'students' | 'employees', name: string) => {
    const { data, error } = await admin.from(table).insert({ school_id: school, full_name: name }).select('id').single()
    if (error) throw new Error(error.message)
    return data.id as string
  }

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
    school = await schools.create({ name: 'ZZ Reconcile Agent Episodes School' })
    const secret = randomBytes(32).toString('base64url')
    const a = await admin
      .from('attendance_agents')
      .insert({
        school_id: school, install_id: randomUUID(), credential_prefix: randomBytes(8).toString('hex'),
        credential_hash: createHash('sha256').update(secret, 'utf8').digest('hex'), name: 'Resolution Test Agent',
      })
      .select('id')
      .single()
    if (a.error) throw new Error(a.error.message)
    agent = a.data.id
    m1 = await machine('RES-TEST-1')
    m2 = await machine('RES-TEST-2')
    s1 = await person('students', 'Resolution Student One')
    s2 = await person('students', 'Resolution Student Two')
    e1 = await person('employees', 'Resolution Employee One')
    s1UniqueId = (await admin.from('students').select('unique_id').eq('id', s1).single()).data!.unique_id
  })

  afterAll(async () => {
    await schools.cleanup() // events, records, episodes, machines, Agent and people go with the School
  })

  it('a punch inside an open episode resolves to that person and is consumed', async () => {
    const day = '2026-09-21'
    const id = nextUser()
    await episode({ machine_user_id: id, linked_at: at('2026-09-20', '00:00'), sync_state: 'synced' })
    const first = await agentEvent(id, at(day, '02:00'))
    const last = await agentEvent(id, at(day, '09:30'))
    const r = await reconcile(day)
    expect(r.error).toBeNull()
    expect(await record(s1, day)).toMatchObject({ person_type: 'student', entry_at: at(day, '02:00'), exit_at: at(day, '09:30'), status: 'present' })
    expect([await processed(first), await processed(last)]).toEqual([true, true])
  })

  it('a punch before the episode was linked does not resolve', async () => {
    const day = '2026-09-22'
    const id = nextUser()
    await episode({ machine_user_id: id, linked_at: at(day, '05:00'), sync_state: 'synced', student_id: s2 })
    const early = await agentEvent(id, at(day, '02:00'))
    await reconcile(day)
    expect(await processed(early)).toBe(false)
    expect(await record(s2, day)).toBeNull()
  })

  it('pending and cancelled episodes never match', async () => {
    const day = '2026-09-23'
    const pendingId = nextUser()
    await episode({ machine_user_id: pendingId })
    const cancelledId = nextUser()
    await episode({ machine_user_id: cancelledId, unlinked_at: at(day, '00:00'), sync_state: 'cancelled' })
    const a = await agentEvent(pendingId, at(day, '02:00'))
    const b = await agentEvent(cancelledId, at(day, '03:00'))
    await reconcile(day)
    expect([await processed(a), await processed(b)]).toEqual([false, false])
    expect(await record(s1, day)).toBeNull()
  })

  it('a reused device user ID resolves each punch to the person of its own period; the gap resolves to nobody', async () => {
    const day = '2026-09-24'
    const id = nextUser()
    await episode({ machine_user_id: id, linked_at: at(day, '00:00'), unlinked_at: at(day, '04:00'), sync_state: 'removed' })
    await episode({ machine_user_id: id, student_id: s2, linked_at: at(day, '06:00'), sync_state: 'synced' })
    const s1Punch = await agentEvent(id, at(day, '02:00'))
    const gapPunch = await agentEvent(id, at(day, '05:00'))
    const s2Punch = await agentEvent(id, at(day, '07:00'))
    await reconcile(day)
    expect(await record(s1, day)).toMatchObject({ entry_at: at(day, '02:00'), exit_at: null })
    expect(await record(s2, day)).toMatchObject({ entry_at: at(day, '07:00'), exit_at: null })
    expect([await processed(s1Punch), await processed(gapPunch), await processed(s2Punch)]).toEqual([true, false, true])
  })

  it('windows are end-exclusive: a punch at the hand-over instant belongs to the new episode', async () => {
    const day = '2026-09-25'
    const id = nextUser()
    await episode({ machine_user_id: id, linked_at: at(day, '00:00'), unlinked_at: at(day, '04:00'), sync_state: 'removed' })
    await episode({ machine_user_id: id, student_id: s2, linked_at: at(day, '04:00'), sync_state: 'synced' })
    await agentEvent(id, at(day, '04:00'))
    await reconcile(day)
    expect(await record(s2, day)).toMatchObject({ entry_at: at(day, '04:00') })
    expect(await record(s1, day)).toBeNull()
  })

  it('resolution is per machine: the same device user ID means different people on different machines', async () => {
    const day = '2026-09-26'
    const id = nextUser()
    await episode({ machine_user_id: id, linked_at: at('2026-09-20', '00:00'), sync_state: 'synced' })
    await episode({ machine_user_id: id, machine_id: m2, student_id: s2, linked_at: at('2026-09-20', '00:00'), sync_state: 'synced' })
    await agentEvent(id, at(day, '02:00'))
    await agentEvent(id, at(day, '03:00'), { machine_id: m2 })
    await reconcile(day)
    expect(await record(s1, day)).toMatchObject({ entry_at: at(day, '02:00') })
    expect(await record(s2, day)).toMatchObject({ entry_at: at(day, '03:00') })
  })

  it('never by a bare unique_id: a device user ID equal to a Machine ID, with no episode, stays unresolved', async () => {
    const day = '2026-09-27'
    const punch = await agentEvent(String(s1UniqueId), at(day, '02:00'))
    await reconcile(day)
    expect(await processed(punch)).toBe(false)
    expect(await record(s1, day)).toBeNull()
  })

  it('never by card for an Agent event, even when it carries an enrolled card number', async () => {
    const day = '2026-09-28'
    const card = `RES-CARD-${randomUUID().slice(0, 8)}`
    const { error } = await admin
      .from('machine_enroll_infos')
      .insert({ school_id: school, type: 'student', student_id: s1, unique_id: s1UniqueId, rfid_card_number: card })
    expect(error).toBeNull()
    const punch = await agentEvent(nextUser(), at(day, '02:00'), { card_number: card })
    await reconcile(day)
    expect(await processed(punch)).toBe(false)
    expect(await record(s1, day)).toBeNull()

    // The same card through the legacy path still resolves by card — and a
    // legacy tap and an Agent punch for one person merge into one record.
    const id = nextUser()
    await episode({ machine_user_id: id, linked_at: at('2026-09-20', '00:00'), sync_state: 'synced' })
    const { data: s } = await admin.from('schools').select('ingest_token').eq('id', school).single()
    const legacy = await anonClient().rpc('ingest_attendance_events', { school, token: s!.ingest_token, events: [{ card_number: card, tapped_at: at(day, '01:30') }] })
    expect(legacy.error).toBeNull()
    await agentEvent(id, at(day, '10:00'))
    await reconcile(day)
    expect(await record(s1, day)).toMatchObject({ entry_at: at(day, '01:30'), exit_at: at(day, '10:00') })
    await admin.from('machine_enroll_infos').delete().eq('rfid_card_number', card)
  })

  it('an employee episode resolves to the employee', async () => {
    const day = '2026-09-29'
    const id = nextUser()
    await episode({ machine_user_id: id, entity_type: 'employee', student_id: null, employee_id: e1, linked_at: at('2026-09-20', '00:00'), sync_state: 'synced' })
    await agentEvent(id, at(day, '02:15'))
    await reconcile(day)
    expect(await record(e1, day)).toMatchObject({ person_type: 'employee', entry_at: at(day, '02:15') })
  })

  it('the queue drain resolves Agent events the same way, and re-running is merge-safe', async () => {
    const day = '2026-09-30'
    const id = nextUser()
    await episode({ machine_user_id: id, student_id: s2, linked_at: at('2026-09-20', '00:00'), sync_state: 'synced' })
    await agentEvent(id, at(day, '02:00'))
    await agentEvent(id, at(day, '08:00'))
    await anonClient().rpc('enqueue_attendance_reconcile_dates', { job_secret: RECONCILE_SECRET, target_date: day, target_school: school })
    const drained = await anonClient().rpc('drain_attendance_reconcile_queue', { job_secret: RECONCILE_SECRET, only_school: school })
    expect(drained.error).toBeNull()
    const once = await record(s2, day)
    expect(once).toMatchObject({ entry_at: at(day, '02:00'), exit_at: at(day, '08:00') })
    await reconcile(day)
    await reconcile(day)
    expect(await record(s2, day)).toEqual(once)
  })
})
