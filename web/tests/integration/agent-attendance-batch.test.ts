import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { POST as activate } from '@/app/api/agent/v1/activate/route'
import { POST as batch } from '@/app/api/agent/v1/attendance/batch/route'
import { signedIn, anonClient } from '../helpers/auth'
import { schoolFixtures } from '../helpers/school-fixture'

// Machine Attendance Phase 8 (migration 0268, Baseline §15, §22.1): Agent
// attendance through POST /api/agent/v1/attendance/batch ->
// ingest_agent_attendance_events -> attendance_events -> attendance_reconcile_dates
// -> queue drain -> per-pair reconcile (episodes only) -> attendance_records.
// Driven through the route handler exactly as the Agent calls it. Everything
// lives in disposable Schools (Asia/Dhaka) dropped afterwards.

const RECONCILE_SECRET = process.env.RECONCILE_SECRET!
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
/** The Agent's EventKeys fallback (pinned by its golden tests). */
const key = (machine: string, user: string, local: string, punch: string | null, verify: string) =>
  sha256(`${machine}|${user}|${local.slice(0, 19)}|${punch ?? ''}|${verify}`)
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

type Ev = Record<string, unknown> & { machineId: string; eventKey: string; machineUserId: string }

describe('Agent attendance ingest /api/agent/v1/attendance/batch (Phase 8)', () => {
  let admin: SupabaseClient
  let school: string
  let other: string
  let credential: string
  let agentId: string
  let otherAgentCredential: string
  let m1: string
  let m2: string
  let mOther: string
  let mForeign: string
  let mNone: string
  let s1: string
  let s2: string
  let s1UniqueId: number
  let userSeq = 0
  const schools = schoolFixtures(() => admin)
  const nextUser = () => String(70000000 + ++userSeq)

  const ev = (machineId: string, user: string, local: string, extra: Record<string, unknown> = {}): Ev => {
    const punch = 'punchState' in extra ? (extra.punchState as string | null) : '0'
    const verify = (extra.verifyMode as string | undefined) ?? '3'
    return { machineId, machineUserId: user, deviceLocalTime: local, verifyMode: verify, punchState: punch, eventKey: key(machineId, user, local, punch, verify), ...extra }
  }
  const send = async (events: unknown[], cred = credential, batchId: string = randomUUID()) => {
    const res = await batch(new Request('http://localhost/api/agent/v1/attendance/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cred}` },
      body: JSON.stringify({ batchId, events }),
    }))
    return { status: res.status, body: await res.json() }
  }
  const outcome = (body: { accepted: Ev[]; duplicates: Ev[]; rejected: (Ev & { reason: string })[] }, e: Ev) => {
    const same = (x: Ev) => x.machineId === e.machineId && x.eventKey === e.eventKey
    if (body.accepted.some(same)) return 'accepted'
    if (body.duplicates.some(same)) return 'duplicate'
    return body.rejected.find(same)?.reason ?? 'missing'
  }
  const stored = async (e: Ev) =>
    (await admin.from('attendance_events').select('*').eq('machine_id', e.machineId).eq('event_key', e.eventKey).maybeSingle()).data
  const pair = async (d: string, s = school) =>
    (await admin.from('attendance_reconcile_dates').select('status, requested_at').eq('school_id', s).eq('attendance_date', d).maybeSingle()).data
  const drain = () => anonClient().rpc('drain_attendance_reconcile_queue', { job_secret: RECONCILE_SECRET, only_school: school })
  const record = async (personId: string, d: string) =>
    (await admin.from('attendance_records').select('entry_at, exit_at').eq('person_id', personId).eq('att_date', d).maybeSingle()).data
  const episode = async (row: Record<string, unknown>) => {
    const { error } = await admin.from('attendance_machine_enrollments').insert({ school_id: school, machine_id: m1, entity_type: 'student', student_id: s1, sync_state: 'synced', ...row })
    if (error) throw new Error(error.message)
  }

  const activated = async (s: string) => {
    const plain = Array.from(randomBytes(12), (b) => ALPHABET[b % 32]).join('')
    const { error } = await admin.from('attendance_agent_activation_codes').insert({ school_id: s, code_hash: sha256(plain), expires_at: new Date(Date.now() + 3600_000).toISOString() })
    if (error) throw new Error(error.message)
    const secret = randomBytes(32).toString('base64url')
    const prefix = randomBytes(8).toString('hex')
    const res = await activate(new Request('http://localhost/api/agent/v1/activate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: plain, installId: randomUUID(), credentialPrefix: prefix, credentialVerifier: sha256(secret) }),
    }))
    expect(res.status).toBe(200)
    return { id: (await res.json()).agentId as string, credential: `agt_${prefix}_${secret}` }
  }
  const machine = async (s: string, agent: string | null, extra: Record<string, unknown> = {}) => {
    const { data, error } = await admin
      .from('attendance_machines')
      .insert({ school_id: s, machine_type: 'timmy', model: 'TM52GPRS', serial_number: `P8-${randomUUID().slice(0, 8)}`, location: 'Phase 8 Gate', shift_scope: 'none', agent_id: agent, ...extra })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data.id as string
  }
  const student = async (name: string) => (await admin.from('students').insert({ school_id: school, full_name: name }).select('id, unique_id').single()).data!

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
    school = await schools.create({ name: 'ZZ Agent Attendance Ingest School' })
    other = await schools.create({ name: 'ZZ Agent Attendance Ingest Other' })
    const a = await activated(school)
    credential = a.credential
    agentId = a.id
    const b = await activated(school)
    otherAgentCredential = b.credential
    const f = await activated(other)
    m1 = await machine(school, agentId)
    m2 = await machine(school, agentId)
    mOther = await machine(school, b.id)
    mForeign = await machine(other, f.id)
    mNone = await machine(school, null)
    const one = await student('Ingest Student One')
    const two = await student('Ingest Student Two')
    s1 = one.id
    s2 = two.id
    s1UniqueId = one.unique_id
  })

  afterAll(async () => {
    await schools.cleanup()
  })

  describe('ingest', () => {
    it('accepts a valid event with server-computed time, School-local date and an Agent snapshot', async () => {
      const e = ev(m1, nextUser(), '2026-09-20T08:00:00', { deviceSerial: 'TMBD52120878', raw: { event: '0' } })
      const r = await send([e])
      expect(r.status).toBe(200)
      expect(outcome(r.body, e)).toBe('accepted')
      const row = await stored(e)
      expect(row).toMatchObject({
        source: 'agent', agent_id: agentId, school_id: school, machine_user_id: e.machineUserId, verify_mode: '3', punch_state: '0',
        device_time_zone: 'Asia/Dhaka', attendance_date: '2026-09-20', device_serial: 'TMBD52120878', raw: { event: '0' }, card_number: null, processed: false,
      })
      expect(new Date(row!.tapped_at).toISOString()).toBe('2026-09-20T02:00:00.000Z')
      expect(row!.device_local_time).toBe('2026-09-20T08:00:00')
    })

    it('an exact duplicate is reported duplicate, changes nothing, and still re-pends its pair', async () => {
      const e = ev(m1, nextUser(), '2026-09-21T08:00:00')
      await send([e])
      const before = await stored(e)
      await drain()
      expect((await pair('2026-09-21'))!.status).toBe('done')
      const r = await send([{ ...e, raw: { changed: 'yes' }, deviceSerial: 'OTHER' }])
      expect(outcome(r.body, e)).toBe('duplicate')
      expect(await stored(e)).toEqual(before)
      expect((await pair('2026-09-21'))!.status).toBe('pending')
    })

    it('a batch spanning several days enqueues every pair; a late historical event re-pends a done pair', async () => {
      const days = ['2026-09-01', '2026-09-02', '2026-09-03']
      const r = await send(days.map((d) => ev(m1, nextUser(), `${d}T09:00:00`)))
      expect(r.body.accepted).toHaveLength(3)
      for (const d of days) expect((await pair(d))!.status).toBe('pending')
      await drain()
      expect((await pair('2026-09-01'))!.status).toBe('done')
      await send([ev(m1, nextUser(), '2026-09-01T15:00:00')])
      expect((await pair('2026-09-01'))!.status).toBe('pending')
    })

    it('refuses machines that are not this Agent\'s, per event, and keeps the valid ones', async () => {
      const good = ev(m1, nextUser(), '2026-09-22T08:00:00')
      const bad = [ev(mOther, nextUser(), '2026-09-22T08:00:00'), ev(mForeign, nextUser(), '2026-09-22T08:00:00'), ev(mNone, nextUser(), '2026-09-22T08:00:00'), ev(randomUUID(), nextUser(), '2026-09-22T08:00:00')]
      const r = await send([...bad, good])
      expect(r.status).toBe(200)
      expect(outcome(r.body, good)).toBe('accepted')
      for (const e of bad) expect(outcome(r.body, e)).toBe('MACHINE_NOT_ASSIGNED')
      for (const e of bad) expect(await stored(e)).toBeNull()
      expect(await pair('2026-09-22', other)).toBeNull()
      // The other School's Agent cannot use this School's machine either.
      expect(outcome((await send([ev(m1, nextUser(), '2026-09-22T09:00:00')], otherAgentCredential)).body, ev(m1, String(userSeq), '2026-09-22T09:00:00'))).toBe('MACHINE_NOT_ASSIGNED')
    })

    it('disabled machines keep accepting; archived machines accept only punches before archived_at', async () => {
      const mOff = await machine(school, agentId, { enabled: false })
      expect(outcome((await send([ev(mOff, nextUser(), '2026-09-23T08:00:00')])).body, ev(mOff, String(userSeq), '2026-09-23T08:00:00'))).toBe('accepted')
      const mArc = await machine(school, agentId)
      expect((await admin.rpc('archive_attendance_machine', { machine_id: mArc })).error).toBeNull()
      const archivedAt = new Date((await admin.from('attendance_machines').select('archived_at').eq('id', mArc).single()).data!.archived_at)
      const local = (d: Date) => new Date(d.getTime() + 6 * 3600_000).toISOString().slice(0, 19) // Asia/Dhaka wall clock
      const early = ev(mArc, nextUser(), local(new Date(archivedAt.getTime() - 3600_000)))
      const late = ev(mArc, nextUser(), local(new Date(archivedAt.getTime() + 3600_000)))
      const r = await send([early, late])
      expect([outcome(r.body, early), outcome(r.body, late)]).toEqual(['accepted', 'MACHINE_ARCHIVED'])
    })

    it('recomputes the event key and refuses a mismatch without storing it under another key', async () => {
      const e = { ...ev(m1, nextUser(), '2026-09-24T08:00:00'), eventKey: 'f'.repeat(64) }
      const r = await send([e])
      expect(outcome(r.body, e)).toBe('EVENT_KEY_MISMATCH')
      const { count } = await admin.from('attendance_events').select('id', { count: 'exact', head: true }).eq('machine_id', m1).eq('machine_user_id', e.machineUserId)
      expect(count).toBe(0)
    })

    it('server UTC from the machine zone; attendance_date is the School-local day', async () => {
      const lon = await machine(school, agentId, { time_zone: 'Europe/London' })
      const dhakaMidnight = ev(m1, nextUser(), '2026-09-25T00:30:00')
      const london = ev(lon, nextUser(), '2026-07-01T23:30:00')
      await send([dhakaMidnight, london])
      const a = (await stored(dhakaMidnight))!
      expect([new Date(a.tapped_at).toISOString(), a.attendance_date]).toEqual(['2026-09-24T18:30:00.000Z', '2026-09-25'])
      const b = (await stored(london))!
      expect([new Date(b.tapped_at).toISOString(), b.attendance_date, b.device_time_zone]).toEqual(['2026-07-01T22:30:00.000Z', '2026-07-02', 'Europe/London'])
      // DST: a London gap and overlap are refused, never guessed.
      const gap = ev(lon, nextUser(), '2026-03-29T01:30:00')
      const overlap = ev(lon, nextUser(), '2026-10-25T01:30:00')
      const r = await send([gap, overlap])
      expect([outcome(r.body, gap), outcome(r.body, overlap)]).toEqual(['NONEXISTENT_LOCAL_TIME', 'AMBIGUOUS_LOCAL_TIME'])
    })

    it('optional Agent UTC / zone are checks only: a mismatch is TIME_MISMATCH, the rest of the batch is accepted', async () => {
      const okE = ev(m1, nextUser(), '2026-09-26T08:00:00', { deviceTimeZone: 'Asia/Dhaka', eventTimeUtc: '2026-09-26T02:00:00Z' })
      const badUtc = ev(m1, nextUser(), '2026-09-26T09:00:00', { eventTimeUtc: '2026-09-26T09:00:00Z' })
      const badZone = ev(m1, nextUser(), '2026-09-26T10:00:00', { deviceTimeZone: 'UTC' })
      const r = await send([badUtc, okE, badZone])
      expect([outcome(r.body, badUtc), outcome(r.body, okE), outcome(r.body, badZone)]).toEqual(['TIME_MISMATCH', 'accepted', 'TIME_MISMATCH'])
      expect(await stored(badUtc)).toBeNull()
    })

    it('field rules: punchState may be null, verifyMode is required, raw is bounded, fingerprint punches need no card', async () => {
      const nullPunch = ev(m1, nextUser(), '2026-09-27T08:00:00', { punchState: null })
      const fingerprint = ev(m1, nextUser(), '2026-09-27T09:00:00', { verifyMode: '1' })
      const noVerify = { ...ev(m1, nextUser(), '2026-09-27T10:00:00'), verifyMode: undefined }
      const bigRaw = ev(m1, nextUser(), '2026-09-27T11:00:00', { raw: { blob: 'x'.repeat(17000) } })
      const zoned = { ...ev(m1, nextUser(), '2026-09-27T12:00:00'), deviceLocalTime: '2026-09-27T12:00:00+06:00' }
      const r = await send([nullPunch, fingerprint, noVerify, bigRaw, zoned])
      expect([nullPunch, fingerprint, noVerify, bigRaw, zoned].map((e) => outcome(r.body, e))).toEqual(['accepted', 'accepted', 'INVALID_EVENT', 'INVALID_EVENT', 'INVALID_EVENT'])
      expect((await stored(nullPunch))!.punch_state).toBeNull()
      expect((await stored(fingerprint))!.card_number).toBeNull()
    })

    it('batch-level rules: credential, shape and size', async () => {
      expect((await send([ev(m1, nextUser(), '2026-09-28T08:00:00')], 'agt_short')).status).toBe(401)
      expect((await send([ev(m1, nextUser(), '2026-09-28T08:00:00')], `agt_${randomBytes(8).toString('hex')}_${randomBytes(32).toString('base64url')}`)).status).toBe(401)
      expect((await send([])).status).toBe(400)
      expect((await send([ev(m1, nextUser(), '2026-09-28T08:00:00')], credential, 'not-a-uuid')).status).toBe(400)
      expect((await send(Array.from({ length: 1001 }, () => ev(m1, '1', '2026-09-28T08:00:00')))).status).toBe(413)
    })
  })

  describe('reconcile after the queue drain (episodes only)', () => {
    it('resolves inside the episode window; before linked_at, after unlinked_at and on another machine stay unresolved', async () => {
      const id = nextUser()
      await episode({ machine_user_id: id, linked_at: '2026-10-01T03:00:00Z', unlinked_at: '2026-10-01T09:00:00Z', sync_state: 'removed' })
      const before = ev(m1, id, '2026-10-01T08:30:00') // 02:30Z
      const inside = ev(m1, id, '2026-10-01T10:00:00') // 04:00Z
      const after = ev(m1, id, '2026-10-01T16:00:00') // 10:00Z
      const elsewhere = ev(m2, id, '2026-10-01T11:00:00')
      await send([before, inside, after, elsewhere])
      expect((await drain()).error).toBeNull()
      expect(await record(s1, '2026-10-01')).toMatchObject({ entry_at: '2026-10-01T04:00:00+00:00', exit_at: null })
      expect([(await stored(before))!.processed, (await stored(inside))!.processed, (await stored(after))!.processed, (await stored(elsewhere))!.processed])
        .toEqual([false, true, false, false])
    })

    it('a reused machine user id maps each punch to the episode of its own time', async () => {
      const id = nextUser()
      await episode({ machine_user_id: id, linked_at: '2026-10-02T00:00:00Z', unlinked_at: '2026-10-02T05:00:00Z', sync_state: 'removed' })
      await episode({ machine_user_id: id, student_id: s2, linked_at: '2026-10-02T05:00:00Z' })
      await send([ev(m1, id, '2026-10-02T08:00:00'), ev(m1, id, '2026-10-02T13:00:00')]) // 02:00Z, 07:00Z
      await drain()
      expect(await record(s1, '2026-10-02')).toMatchObject({ entry_at: '2026-10-02T02:00:00+00:00' })
      expect(await record(s2, '2026-10-02')).toMatchObject({ entry_at: '2026-10-02T07:00:00+00:00' })
    })

    it('an Agent event never card-matches; a legacy ingest-token tap with the same card still does', async () => {
      const card = `P8-CARD-${randomUUID().slice(0, 8)}`
      expect((await admin.from('machine_enroll_infos').insert({ school_id: school, type: 'student', student_id: s1, unique_id: s1UniqueId, rfid_card_number: card })).error).toBeNull()
      const agentPunch = ev(m1, nextUser(), '2026-10-03T08:00:00', { card, raw: { card } })
      await send([agentPunch])
      const { data: s } = await admin.from('schools').select('ingest_token').eq('id', school).single()
      expect((await anonClient().rpc('ingest_attendance_events', { school, token: s!.ingest_token, events: [{ card_number: card, tapped_at: '2026-10-03T05:00:00Z' }] })).error).toBeNull()
      await drain()
      expect((await stored(agentPunch))!.processed).toBe(false)
      expect(await record(s1, '2026-10-03')).toMatchObject({ entry_at: '2026-10-03T05:00:00+00:00', exit_at: null })
      await admin.from('machine_enroll_infos').delete().eq('rfid_card_number', card)
    })

    it('automatic attendance off: the pair is skipped and the events stay unprocessed', async () => {
      const id = nextUser()
      await episode({ machine_user_id: id, linked_at: '2026-09-01T00:00:00Z' })
      const e = ev(m1, id, '2026-10-04T08:00:00')
      expect((await admin.from('schools').update({ automatic_attendance_enabled: false }).eq('id', school)).error).toBeNull()
      try {
        await send([e])
        await drain()
        expect((await pair('2026-10-04'))!.status).toBe('skipped')
        expect((await stored(e))!.processed).toBe(false)
      } finally {
        await admin.from('schools').update({ automatic_attendance_enabled: true }).eq('id', school)
      }
    })
  })
})
