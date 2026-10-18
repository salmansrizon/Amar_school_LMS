import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, anonClient } from '../helpers/auth'
import { schoolFixtures } from '../helpers/school-fixture'

// Machine Attendance Phase 3 (migrations 0218 + 0219, ADR 0033): attendance_events
// holds legacy card taps ('ingest_token') and Attendance Agent events
// ('agent') side by side, with source-aware shape checks and machine-scoped
// idempotency. There is no Agent ingest function yet (Phase 8), so Agent rows
// are written directly by Super Admin — the only role the table lets write.
//
// Synthetic data only: TIMY-shaped values from the Phase 1A mapping
// (EnrollNumber -> machine_user_id, VerifyMode -> verify_mode,
// InOutMode -> punch_state, Event -> raw.event), no real serials or IPs.

const RECONCILE_SECRET = process.env.RECONCILE_SECRET!
const hash = () => randomBytes(32).toString('hex')
const FIXTURE_AGENT_A = { install_id: '0216a9e7-0000-4000-8000-00000000000a', credential_prefix: 'schemaFixtureA0216', name: 'School A Agent' }
const DAY = '2026-09-20'

describe('attendance_events Agent columns (Machine Attendance Phase 3)', () => {
  let admin: SupabaseClient
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let schoolA: string
  let scratch: string
  let scratchAgent: string
  let machine1: string
  let machine2: string
  let agentA: string
  let machineA: string
  const schools = schoolFixtures(() => admin)

  const schoolOf = async (owner: SupabaseClient) => {
    const { data: { user } } = await owner.auth.getUser()
    return (await owner.from('profiles').select('school_id').eq('id', user!.id).single()).data!.school_id as string
  }

  const insertMachine = async (school: string, serial: string) => {
    const { data, error } = await admin
      .from('attendance_machines')
      .insert({ school_id: school, machine_type: 'timmy', model: 'TM52GPRS', serial_number: serial, location: 'Events Test Gate', shift_scope: 'none', port: 5005 })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data.id as string
  }

  /** A complete, valid Agent event for the scratch School; override to break it. */
  const agentEvent = (overrides: Record<string, unknown> = {}) => ({
    school_id: scratch,
    source: 'agent',
    tapped_at: `${DAY}T02:00:00Z`,
    machine_id: machine1,
    agent_id: scratchAgent,
    machine_user_id: '99990001',
    event_key: `key-${randomUUID()}`,
    device_local_time: `${DAY}T08:00:00`,
    device_time_zone: 'Asia/Dhaka',
    verify_mode: '3',
    punch_state: '0',
    raw: { event: 0 },
    ...overrides,
  })

  const insertEvent = (row: Record<string, unknown>, client: SupabaseClient = admin) =>
    client.from('attendance_events').insert(row).select('id, source, card_number, machine_id, event_key, raw').single()

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    schoolA = await schoolOf(ownerA)

    scratch = await schools.create({ name: 'ZZ Attendance Events Agent Columns School' })
    const agent = await admin
      .from('attendance_agents')
      .insert({ school_id: scratch, install_id: randomUUID(), credential_prefix: randomBytes(8).toString('hex'), credential_hash: hash(), name: 'Events Test Agent' })
      .select('id')
      .single()
    if (agent.error) throw new Error(agent.error.message)
    scratchAgent = agent.data.id
    machine1 = await insertMachine(scratch, 'EVT-TEST-1')
    machine2 = await insertMachine(scratch, 'EVT-TEST-2')

    // School A (for the RLS checks): the 3A suite's well-known fixture Agent,
    // created here the same way if that suite has not run on this database.
    const found = await admin.from('attendance_agents_safe').select('id').eq('install_id', FIXTURE_AGENT_A.install_id).maybeSingle()
    if (found.data) {
      agentA = found.data.id
    } else {
      const created = await admin
        .from('attendance_agents')
        .insert({ school_id: schoolA, credential_hash: hash(), ...FIXTURE_AGENT_A })
        .select('id')
        .single()
      if (created.error) throw new Error(created.error.message)
      agentA = created.data.id
    }
    await admin.from('attendance_events').delete().like('event_key', 'evt-rls-%')
    await admin.from('attendance_machines').delete().eq('serial_number', 'EVT-TEST-A')
    machineA = await insertMachine(schoolA, 'EVT-TEST-A')
  })

  afterAll(async () => {
    // School A rows first (events, then the machine they reference); the
    // scratch School takes its events, machines and Agent with it.
    await admin.from('attendance_events').delete().like('event_key', 'evt-rls-%')
    if (machineA) await admin.from('attendance_machines').delete().eq('id', machineA)
    await schools.cleanup()
  })

  describe('legacy rows', () => {
    it('existing rows are legacy: no Agent event exists outside this suite', async () => {
      const { data, error } = await admin.from('attendance_events').select('id, school_id').eq('source', 'agent')
      expect(error).toBeNull()
      expect((data ?? []).filter((r) => r.school_id !== scratch && r.school_id !== schoolA)).toEqual([])
    })

    it('an old-style insert that names no source is a legacy card tap', async () => {
      const { data, error } = await insertEvent({ school_id: scratch, card_number: 'EVT-CARD-1', tapped_at: `${DAY}T03:00:00Z` })
      expect(error).toBeNull()
      expect(data).toMatchObject({ source: 'ingest_token', card_number: 'EVT-CARD-1', machine_id: null, event_key: null, raw: null })
    })

    it('the legacy ingest RPC still inserts card taps as legacy rows', async () => {
      const { data: school } = await admin.from('schools').select('ingest_token').eq('id', scratch).single()
      const r = await anonClient().rpc('ingest_attendance_events', {
        school: scratch,
        token: school!.ingest_token,
        events: [{ card_number: 'EVT-CARD-2', tapped_at: `${DAY}T04:00:00Z` }],
      })
      expect(r.error).toBeNull()
      expect(r.data).toBe(1)
      const { data } = await admin.from('attendance_events').select('source, machine_id').eq('school_id', scratch).eq('card_number', 'EVT-CARD-2')
      expect(data).toEqual([{ source: 'ingest_token', machine_id: null }])
    })

    it('a legacy row without a card number is rejected', async () => {
      expect((await insertEvent({ school_id: scratch, tapped_at: `${DAY}T03:00:00Z` })).error).not.toBeNull()
      expect((await insertEvent({ school_id: scratch, source: 'ingest_token', card_number: null, tapped_at: `${DAY}T03:00:00Z` })).error).not.toBeNull()
    })

    it('a legacy row cannot carry Agent identity (no mixed shapes)', async () => {
      for (const field of [
        { machine_id: machine1 },
        { agent_id: scratchAgent },
        { event_key: 'k' },
        { machine_user_id: '1' },
        { device_local_time: `${DAY}T08:00:00` },
        { device_serial: 'SYN-SERIAL-LEGACY' },
      ]) {
        const r = await insertEvent({ school_id: scratch, card_number: 'EVT-CARD-3', tapped_at: `${DAY}T03:00:00Z`, ...field })
        expect(r.error, JSON.stringify(field)).not.toBeNull()
      }
    })

    it('an unknown source is rejected', async () => {
      expect((await insertEvent(agentEvent({ source: 'adms' }))).error).not.toBeNull()
    })
  })

  describe('Agent rows', () => {
    it('an Agent event needs no card number and keeps vendor metadata in raw', async () => {
      const raw = { event: 0, tMachineNumber: '1', eMachineNumber: '1' }
      const { data, error } = await insertEvent(agentEvent({ card_number: null, raw }))
      expect(error).toBeNull()
      expect(data).toMatchObject({ source: 'agent', card_number: null, machine_id: machine1, raw })
    })

    // 0219: punch_state is optional (some devices have no punch state); the rest stay required.
    for (const field of ['machine_id', 'machine_user_id', 'agent_id', 'event_key', 'device_local_time', 'device_time_zone', 'verify_mode']) {
      it(`an Agent event requires ${field}`, async () => {
        const r = await insertEvent(agentEvent({ [field]: null }))
        expect(r.error).not.toBeNull()
        expect(r.error!.message).toMatch(/attendance_events_agent_shape/)
      })
    }

    it('punch_state may be absent (NULL) or a real device code', async () => {
      const none = await insertEvent(agentEvent({ punch_state: null }))
      expect(none.error).toBeNull()
      const real = await insertEvent(agentEvent({ punch_state: '0' }))
      expect(real.error).toBeNull()
      const { data } = await admin.from('attendance_events').select('id, punch_state').in('id', [none.data!.id, real.data!.id])
      expect(Object.fromEntries(data!.map((r) => [r.id, r.punch_state]))).toEqual({ [none.data!.id]: null, [real.data!.id]: '0' })
    })

    it('an empty punch_state string is rejected (absence is NULL, not a placeholder)', async () => {
      const r = await insertEvent(agentEvent({ punch_state: '' }))
      expect(r.error?.message).toMatch(/attendance_events_punch_state_shape/)
    })

    it('device_serial is an optional diagnostic snapshot on Agent events', async () => {
      const withSerial = await insertEvent(agentEvent({ device_serial: 'SYN-SERIAL-0001' }))
      expect(withSerial.error).toBeNull()
      const withoutSerial = await insertEvent(agentEvent({ device_serial: null }))
      expect(withoutSerial.error).toBeNull()
      const { data } = await admin.from('attendance_events').select('id, device_serial').in('id', [withSerial.data!.id, withoutSerial.data!.id])
      expect(Object.fromEntries(data!.map((r) => [r.id, r.device_serial]))).toEqual({
        [withSerial.data!.id]: 'SYN-SERIAL-0001',
        [withoutSerial.data!.id]: null,
      })
    })

    it('device_local_time is stored as wall-clock time with no zone', async () => {
      const key = `key-${randomUUID()}`
      expect((await insertEvent(agentEvent({ event_key: key, device_local_time: '2018-01-01T04:32:49' }))).error).toBeNull()
      const { data } = await admin.from('attendance_events').select('device_local_time, device_time_zone').eq('event_key', key).single()
      expect(data).toEqual({ device_local_time: '2018-01-01T04:32:49', device_time_zone: 'Asia/Dhaka' })
    })

    it('rejects an invalid device time zone and a non-object raw', async () => {
      expect((await insertEvent(agentEvent({ device_time_zone: '+06' }))).error).not.toBeNull()
      expect((await insertEvent(agentEvent({ raw: [0] }))).error).not.toBeNull()
    })
  })

  describe('machine-scoped idempotency', () => {
    it('the same machine cannot record the same event_key twice', async () => {
      const key = `key-${randomUUID()}`
      expect((await insertEvent(agentEvent({ event_key: key }))).error).toBeNull()
      const dup = await insertEvent(agentEvent({ event_key: key, device_local_time: `${DAY}T09:00:00` }))
      expect(dup.error?.message).toMatch(/attendance_events_machine_event_key_key/)
    })

    it('device_serial plays no part in uniqueness: a different serial does not make a duplicate key new', async () => {
      const key = `key-${randomUUID()}`
      expect((await insertEvent(agentEvent({ event_key: key, device_serial: 'SYN-SERIAL-A' }))).error).toBeNull()
      const dup = await insertEvent(agentEvent({ event_key: key, device_serial: 'SYN-SERIAL-B' }))
      expect(dup.error?.message).toMatch(/attendance_events_machine_event_key_key/)
    })

    it('the same event_key on two different machines is two events', async () => {
      const key = `key-${randomUUID()}`
      expect((await insertEvent(agentEvent({ event_key: key, machine_id: machine1 }))).error).toBeNull()
      expect((await insertEvent(agentEvent({ event_key: key, machine_id: machine2 }))).error).toBeNull()
    })
  })

  describe('references', () => {
    it('rejects an unknown machine, or a machine of another School', async () => {
      expect((await insertEvent(agentEvent({ machine_id: randomUUID() }))).error).not.toBeNull()
      expect((await insertEvent(agentEvent({ machine_id: machineA }))).error).not.toBeNull()
    })

    it('rejects an unknown Agent, or an Agent of another School', async () => {
      expect((await insertEvent(agentEvent({ agent_id: randomUUID() }))).error).not.toBeNull()
      expect((await insertEvent(agentEvent({ agent_id: agentA }))).error).not.toBeNull()
    })

    it('a machine with recorded events cannot be deleted', async () => {
      expect((await admin.from('attendance_machines').delete().eq('id', machine1)).error).not.toBeNull()
    })
  })

  describe('access and reconciliation are unchanged', () => {
    it('School members read their own Agent events; another School does not', async () => {
      const key = `evt-rls-${randomUUID()}`
      const r = await insertEvent(agentEvent({ school_id: schoolA, machine_id: machineA, agent_id: agentA, event_key: key }))
      expect(r.error).toBeNull()
      expect((await ownerA.from('attendance_events').select('id, source').eq('event_key', key)).data).toEqual([{ id: r.data!.id, source: 'agent' }])
      expect((await ownerB.from('attendance_events').select('id').eq('event_key', key)).data).toEqual([])
    })

    it('School users and signed-out callers cannot forge an Agent event', async () => {
      const row = agentEvent({ school_id: schoolA, machine_id: machineA, agent_id: agentA, event_key: `evt-rls-${randomUUID()}` })
      expect((await ownerA.from('attendance_events').insert(row)).error).not.toBeNull()
      expect((await anonClient().from('attendance_events').insert(row)).error).not.toBeNull()
    })

    it('reconcile leaves Agent events unresolved (no person resolution yet) and writes no record for them', async () => {
      const key = `key-${randomUUID()}`
      await insertEvent(agentEvent({ event_key: key, tapped_at: '2026-09-21T02:00:00Z', device_local_time: '2026-09-21T08:00:00' }))
      const r = await anonClient().rpc('reconcile_attendance', { job_secret: RECONCILE_SECRET, target_school: scratch, target_date: '2026-09-21' })
      expect(r.error).toBeNull()
      expect(r.data).toBe(0)
      const { data } = await admin.from('attendance_events').select('processed').eq('event_key', key).single()
      expect(data!.processed).toBe(false)
    })
  })
})
