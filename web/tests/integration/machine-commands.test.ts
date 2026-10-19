import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, anonClient } from '../helpers/auth'
import { schoolFixtures } from '../helpers/school-fixture'

// Machine Attendance Phase 3 (migration 0221, ADR 0033): machine_commands and
// the Agent-facing claim_machine_commands / complete_machine_command. The
// Agent side is driven exactly as an Agent will call it: a bearer credential
// agt_<prefix>_<secret>, whose secret is never stored — the test Agent row
// holds only sha256(secret), as activation (Phase 6) will write it. Commands
// are created by Super Admin, the only writer until each feature's creation
// function exists.

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const newSecret = () => randomBytes(32).toString('base64url')

type Claimed = { id: string; type: string; claim_token: string; lease_expires_at: string; attempts: number; machine_id: string | null }

describe('machine_commands (Machine Attendance Phase 3)', () => {
  let admin: SupabaseClient
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let schoolA: string
  let scratch: string
  let other: string
  const schools = schoolFixtures(() => admin)

  // Agents with known credentials.
  type TestAgent = { id: string; prefix: string; secret: string; credential: string }
  let agent1: TestAgent // scratch School
  let agent2: TestAgent // scratch School, second installation
  let agentOther: TestAgent // another School
  let machine1: string // scratch, assigned to agent1
  let machine2: string // scratch, assigned to agent1 (archived / disabled checks)
  let machineAgent2: string // scratch, assigned to agent2
  let cmdMachineA: string // School A, assigned to the 3A fixture Agent (RLS checks)
  let fixtureAgentA: string
  let keySeq = 0

  const key = () => `test:${randomUUID()}:${++keySeq}`

  const makeAgent = async (school: string): Promise<TestAgent> => {
    const prefix = randomBytes(8).toString('hex')
    const secret = newSecret()
    const { data, error } = await admin
      .from('attendance_agents')
      .insert({ school_id: school, install_id: randomUUID(), credential_prefix: prefix, credential_hash: sha256(secret), name: 'Command Test Agent' })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return { id: data.id, prefix, secret, credential: `agt_${prefix}_${secret}` }
  }

  const makeMachine = async (school: string, serial: string, agentId: string) => {
    const { data, error } = await admin
      .from('attendance_machines')
      .insert({ school_id: school, machine_type: 'timmy', model: 'TM52GPRS', serial_number: serial, location: 'Command Test Gate', shift_scope: 'none', agent_id: agentId })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data.id as string
  }

  const command = async (row: Record<string, unknown>) => {
    const { data, error } = await admin
      .from('machine_commands')
      .insert({ school_id: scratch, agent_id: agent1.id, machine_id: machine1, type: 'TEST_CONNECTION', idempotency_key: key(), ...row })
      .select('id')
      .single()
    return { id: data?.id as string, error }
  }

  const claim = (credential: string, max = 10) =>
    anonClient().rpc('claim_machine_commands', { credential, max_commands: max })

  const complete = (credential: string, args: Record<string, unknown>) =>
    anonClient().rpc('complete_machine_command', { credential, ...args })

  const row = async (id: string) => (await admin.from('machine_commands').select('*').eq('id', id).single()).data

  /** Claims everything currently due for an Agent and finishes it, so each test starts clean. */
  const drainAgent = async (agent: TestAgent) => {
    const { data } = await claim(agent.credential, 100)
    for (const c of (data ?? []) as Claimed[]) {
      await complete(agent.credential, { command_id: c.id, claim_token: c.claim_token, status: 'succeeded' })
    }
  }

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    const { data: { user } } = await ownerA.auth.getUser()
    schoolA = (await ownerA.from('profiles').select('school_id').eq('id', user!.id).single()).data!.school_id

    scratch = await schools.create({ name: 'ZZ Machine Commands Test School' })
    other = await schools.create({ name: 'ZZ Machine Commands Other School' })
    agent1 = await makeAgent(scratch)
    agent2 = await makeAgent(scratch)
    agentOther = await makeAgent(other)
    machine1 = await makeMachine(scratch, 'CMD-TEST-1', agent1.id)
    machine2 = await makeMachine(scratch, 'CMD-TEST-2', agent1.id)
    machineAgent2 = await makeMachine(scratch, 'CMD-TEST-3', agent2.id)

    const fx = await admin.from('attendance_agents_safe').select('id').eq('install_id', '0216a9e7-0000-4000-8000-00000000000a').maybeSingle()
    if (!fx.data) throw new Error('run attendance-agents-schema first: School A fixture Agent missing')
    fixtureAgentA = fx.data.id
    await admin.from('attendance_machines').delete().eq('serial_number', 'CMD-TEST-A')
    cmdMachineA = await makeMachine(schoolA, 'CMD-TEST-A', fixtureAgentA)
  })

  afterAll(async () => {
    // The School A machine takes its commands with it (FK cascade); the
    // disposable Schools take everything else.
    if (cmdMachineA) await admin.from('attendance_machines').delete().eq('id', cmdMachineA)
    await schools.cleanup()
  })

  describe('Agent credential', () => {
    it('a valid credential claims; the secret itself is stored nowhere', async () => {
      await drainAgent(agent1)
      const { id } = await command({})
      const r = await claim(agent1.credential)
      expect(r.error).toBeNull()
      expect((r.data as Claimed[]).map((c) => c.id)).toContain(id)
      // The hash columns are unreadable to every client role (0216), so the
      // check is that no readable column carries the secret.
      const { data } = await admin.from('attendance_agents_safe').select('*').eq('id', agent1.id).single()
      expect(JSON.stringify(data)).not.toContain(agent1.secret)
    })

    it('refuses a wrong secret, an unknown prefix, a malformed value and a revoked Agent — and claims nothing', async () => {
      const { id } = await command({})
      for (const bad of [
        `agt_${agent1.prefix}_${newSecret()}`,
        `agt_${randomBytes(8).toString('hex')}_${agent1.secret}`,
        agent1.secret,
        `Bearer agt_${agent1.prefix}_${agent1.secret}`,
        '',
      ]) {
        const r = await claim(bad)
        expect(r.error?.message, bad.slice(0, 12)).toMatch(/invalid agent credential/)
      }
      expect((await row(id))!.status).toBe('pending')

      const revoked = await makeAgent(scratch)
      await admin.from('attendance_agents').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', revoked.id)
      expect((await claim(revoked.credential)).error?.message).toMatch(/invalid agent credential/)
    })

    it('during a rotation overlap the previous secret works until its deadline, then stops', async () => {
      const rotating = await makeAgent(scratch)
      const newer = newSecret()
      const until = new Date(Date.now() + 3_600_000).toISOString()
      await admin
        .from('attendance_agents')
        .update({ credential_hash: sha256(newer), previous_credential_hash: sha256(rotating.secret), previous_valid_until: until })
        .eq('id', rotating.id)
      expect((await claim(`agt_${rotating.prefix}_${newer}`)).error).toBeNull()
      expect((await claim(rotating.credential)).error).toBeNull() // old secret, inside the overlap
      await admin.from('attendance_agents').update({ previous_valid_until: new Date(Date.now() - 1000).toISOString() }).eq('id', rotating.id)
      expect((await claim(rotating.credential)).error?.message).toMatch(/invalid agent credential/)
    })
  })

  describe('claim', () => {
    it('leases a pending command: claimed, a claim token, a lease, attempt 1', async () => {
      await drainAgent(agent1)
      const { id } = await command({ payload: { note: 'probe me' } })
      const claimed = ((await claim(agent1.credential)).data as Claimed[]).find((c) => c.id === id)!
      expect(claimed).toMatchObject({ type: 'TEST_CONNECTION', machine_id: machine1, attempts: 1 })
      expect(claimed.claim_token).toMatch(/^[0-9a-f-]{36}$/)
      expect(new Date(claimed.lease_expires_at).getTime()).toBeGreaterThan(Date.now())
      expect(await row(id)).toMatchObject({ status: 'claimed', claim_token: claimed.claim_token, attempts: 1 })
    })

    it('hands out only the calling Agent\'s commands', async () => {
      await drainAgent(agent1)
      await drainAgent(agent2)
      const mine = await command({})
      const theirs = await command({ agent_id: agent2.id, machine_id: machineAgent2 })
      const ids = ((await claim(agent1.credential)).data as Claimed[]).map((c) => c.id)
      expect(ids).toContain(mine.id)
      expect(ids).not.toContain(theirs.id)
      expect((await claim(agentOther.credential)).data).toEqual([])
    })

    it('respects max_commands and orders by priority, then age', async () => {
      await drainAgent(agent1)
      const low = await command({ priority: 0 })
      const high = await command({ priority: 50 })
      const mid = await command({ priority: 10 })
      const first = (await claim(agent1.credential, 2)).data as Claimed[]
      expect(first.map((c) => c.id)).toEqual([high.id, mid.id])
      expect(((await claim(agent1.credential, 2)).data as Claimed[]).map((c) => c.id)).toEqual([low.id])
      expect((await claim(agent1.credential, 0)).error).not.toBeNull()
      expect((await claim(agent1.credential, 101)).error).not.toBeNull()
    })

    it('a command with a live lease is not handed out again, even to concurrent claims', async () => {
      await drainAgent(agent1)
      const ids = await Promise.all([1, 2, 3, 4, 5].map(() => command({}).then((c) => c.id)))
      const results = await Promise.all([claim(agent1.credential), claim(agent1.credential), claim(agent1.credential)])
      const got = results.flatMap((r) => (r.data as Claimed[]).map((c) => c.id)).filter((id) => ids.includes(id))
      expect(new Set(got).size).toBe(got.length) // nobody got the same command twice
      expect(new Set(got)).toEqual(new Set(ids))
      expect(((await claim(agent1.credential)).data as Claimed[]).filter((c) => ids.includes(c.id))).toEqual([])
    })

    it('does not hand out commands for an archived, disabled or reassigned machine', async () => {
      await drainAgent(agent1)
      // Archive cancels the machine's unfinished commands (0264); restoring
      // the machine does not revive them.
      const onArchived = await command({ machine_id: machine2 })
      await admin.rpc('archive_attendance_machine', { machine_id: machine2 })
      expect(((await claim(agent1.credential)).data as Claimed[]).map((c) => c.id)).not.toContain(onArchived.id)
      expect((await row(onArchived.id))!.status).toBe('cancelled')
      await admin.rpc('restore_attendance_machine', { machine_id: machine2 })
      expect(((await claim(agent1.credential)).data as Claimed[]).map((c) => c.id)).not.toContain(onArchived.id)

      // Disabled or reassigned: the command waits, and is handed out again once
      // the machine is enabled and assigned to this Agent.
      const waiting = await command({ machine_id: machine2 })
      await admin.from('attendance_machines').update({ enabled: false }).eq('id', machine2)
      expect(((await claim(agent1.credential)).data as Claimed[]).map((c) => c.id)).not.toContain(waiting.id)
      await admin.from('attendance_machines').update({ enabled: true, agent_id: agent2.id }).eq('id', machine2)
      expect(((await claim(agent1.credential)).data as Claimed[]).map((c) => c.id)).not.toContain(waiting.id)
      await admin.from('attendance_machines').update({ agent_id: agent1.id }).eq('id', machine2)
      expect(((await claim(agent1.credential)).data as Claimed[]).map((c) => c.id)).toContain(waiting.id)
    })

    it('an expired lease is handed out again with a new token; the old token is then stale', async () => {
      await drainAgent(agent1)
      const { id } = await command({})
      const first = ((await claim(agent1.credential)).data as Claimed[]).find((c) => c.id === id)!
      await admin.from('machine_commands').update({ lease_expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', id)
      const second = ((await claim(agent1.credential)).data as Claimed[]).find((c) => c.id === id)!
      expect(second.claim_token).not.toBe(first.claim_token)
      expect(second.attempts).toBe(2)
      expect((await complete(agent1.credential, { command_id: id, claim_token: first.claim_token, status: 'succeeded' })).data).toBe('stale')
      expect((await complete(agent1.credential, { command_id: id, claim_token: second.claim_token, status: 'succeeded' })).data).toBe('completed')
    })

    it('attempts used up gives failed: an expired lease with no attempts left fails with a timeout, and its late report is stale', async () => {
      await drainAgent(agent1)
      const { id } = await command({ max_attempts: 1 })
      const last = ((await claim(agent1.credential)).data as Claimed[]).find((c) => c.id === id)!
      await admin.from('machine_commands').update({ lease_expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', id)
      expect(((await claim(agent1.credential)).data as Claimed[]).map((c) => c.id)).not.toContain(id)
      const failed = await row(id)
      expect(failed).toMatchObject({ status: 'failed', attempts: 1, error_class: 'timeout', claim_token: null, lease_expires_at: null })
      expect(failed!.completed_at).not.toBeNull()
      expect(failed!.error_detail).toMatch(/lease expired after 1 of 1 attempts/)
      expect((await complete(agent1.credential, { command_id: id, claim_token: last.claim_token, status: 'failed', error_class: 'timeout' })).data).toBe('stale')
    })
  })

  describe('complete', () => {
    it('records success with a result, once; a repeat is acknowledged, a contradiction is stale', async () => {
      await drainAgent(agent1)
      const { id } = await command({})
      const c = ((await claim(agent1.credential)).data as Claimed[]).find((x) => x.id === id)!
      const result = { reachable: true, serial: 'SYN-0001' }
      expect((await complete(agent1.credential, { command_id: id, claim_token: c.claim_token, status: 'succeeded', result })).data).toBe('completed')
      expect((await complete(agent1.credential, { command_id: id, claim_token: c.claim_token, status: 'succeeded', result })).data).toBe('already_completed')
      expect((await complete(agent1.credential, { command_id: id, claim_token: c.claim_token, status: 'failed', error_class: 'timeout' })).data).toBe('stale')
      expect(await row(id)).toMatchObject({ status: 'succeeded', result, error_class: null })
    })

    it('records a failure with a normalized error class; an unknown class or status is refused', async () => {
      await drainAgent(agent1)
      const { id } = await command({})
      const c = ((await claim(agent1.credential)).data as Claimed[]).find((x) => x.id === id)!
      expect((await complete(agent1.credential, { command_id: id, claim_token: c.claim_token, status: 'failed' })).error).not.toBeNull()
      expect((await complete(agent1.credential, { command_id: id, claim_token: c.claim_token, status: 'failed', error_class: 'Kaboom' })).error).not.toBeNull()
      expect((await complete(agent1.credential, { command_id: id, claim_token: c.claim_token, status: 'running' })).error).not.toBeNull()
      expect((await row(id))!.status).toBe('claimed')
      expect((await complete(agent1.credential, {
        command_id: id, claim_token: c.claim_token, status: 'failed', error_class: 'unreachable', error_detail: 'no route to 192.0.2.201',
      })).data).toBe('completed')
      expect(await row(id)).toMatchObject({ status: 'failed', error_class: 'unreachable' })
    })

    it('another Agent cannot complete (or even see) the command', async () => {
      await drainAgent(agent1)
      const { id } = await command({})
      const c = ((await claim(agent1.credential)).data as Claimed[]).find((x) => x.id === id)!
      const r = await complete(agent2.credential, { command_id: id, claim_token: c.claim_token, status: 'succeeded' })
      expect(r.error?.message).toMatch(/not found/)
      expect((await row(id))!.status).toBe('claimed')
    })

    it('a finished command can never change again, not even by Super Admin', async () => {
      await drainAgent(agent1)
      const { id } = await command({})
      const c = ((await claim(agent1.credential)).data as Claimed[]).find((x) => x.id === id)!
      await complete(agent1.credential, { command_id: id, claim_token: c.claim_token, status: 'succeeded' })
      expect((await admin.from('machine_commands').update({ status: 'pending' }).eq('id', id)).error?.message).toMatch(/finished/)
    })
  })

  describe('creation rules', () => {
    it('an idempotency key is unique per School', async () => {
      const k = key()
      expect((await command({ idempotency_key: k })).error).toBeNull()
      expect((await command({ idempotency_key: k })).error).not.toBeNull()
      const elsewhere = await admin.from('machine_commands').insert({ school_id: other, agent_id: agentOther.id, type: 'REFRESH_CONFIG', idempotency_key: k })
      expect(elsewhere.error).toBeNull()
    })

    it('validates type and payload; only REFRESH_CONFIG may omit the machine', async () => {
      expect((await command({ type: 'FORMAT_DEVICE' })).error).not.toBeNull()
      expect((await command({ payload: [1, 2] })).error).not.toBeNull()
      expect((await command({ machine_id: null })).error).not.toBeNull()
      expect((await command({ machine_id: null, type: 'REFRESH_CONFIG' })).error).toBeNull()
    })

    it('the machine must belong to the same School and be assigned to the command\'s Agent', async () => {
      expect((await command({ machine_id: machineAgent2 })).error?.message).toMatch(/assigned to its Attendance Agent/)
      expect((await command({ machine_id: cmdMachineA })).error).not.toBeNull()
      expect((await command({ agent_id: agentOther.id })).error).not.toBeNull()
    })

    it('what a command is cannot be rewritten after creation', async () => {
      const { id } = await command({ payload: { a: 1 } })
      for (const change of [{ payload: { a: 2 } }, { type: 'SYNC_TIME' }, { machine_id: machine2 }, { idempotency_key: key() }]) {
        expect((await admin.from('machine_commands').update(change).eq('id', id)).error, JSON.stringify(change)).not.toBeNull()
      }
    })
  })

  describe('access', () => {
    it('School members read their own School\'s commands; another School and signed-out callers do not', async () => {
      const { data, error } = await admin
        .from('machine_commands')
        .insert({ school_id: schoolA, agent_id: fixtureAgentA, machine_id: cmdMachineA, type: 'TEST_CONNECTION', idempotency_key: key() })
        .select('id')
        .single()
      expect(error).toBeNull()
      expect((await ownerA.from('machine_commands').select('id, status').eq('id', data!.id)).data).toEqual([{ id: data!.id, status: 'pending' }])
      expect((await ownerB.from('machine_commands').select('id').eq('id', data!.id)).data).toEqual([])
      const anon = await anonClient().from('machine_commands').select('id').eq('id', data!.id)
      expect(anon.error !== null || (anon.data ?? []).length === 0).toBe(true)
    })

    it('School users cannot create, edit, complete or delete commands directly', async () => {
      const ins = await ownerA.from('machine_commands').insert({
        school_id: schoolA, agent_id: fixtureAgentA, machine_id: cmdMachineA, type: 'TEST_CONNECTION', idempotency_key: key(),
      })
      expect(ins.error).not.toBeNull()
      const { data } = await ownerA.from('machine_commands').select('id').eq('machine_id', cmdMachineA).limit(1).single()
      await ownerA.from('machine_commands').update({ status: 'succeeded', completed_at: new Date().toISOString() }).eq('id', data!.id)
      expect((await ownerA.from('machine_commands').delete().eq('id', data!.id)).error).not.toBeNull()
      expect((await row(data!.id))!.status).toBe('pending')
    })

    it('no application role deletes a command, Super Admin included', async () => {
      const { id } = await command({})
      expect((await admin.from('machine_commands').delete().eq('id', id)).error).not.toBeNull()
    })
  })
})
