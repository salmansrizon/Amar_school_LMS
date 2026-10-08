import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, anonClient } from '../helpers/auth'
import { ensureStaffLogin } from '../helpers/staff'
import { schoolFixtures } from '../helpers/school-fixture'

// Machine Attendance Phase 3 slice 3A (migration 0216, ADR 0033): schema and
// RLS foundation for Attendance Agent identity. No Phase 6 business functions
// exist yet, so fixtures are written directly by Super Admin, the only role the
// schema lets write. Everything asserted here is the database's own guarantee.
//
// Agents are revoked, never deleted: no application role can delete one. So
//   * the seeded Schools A/B each hold ONE well-known fixture Agent, created on
//     the first run and reused after (fixed install_id), for the visibility
//     tests; nothing ever changes it;
//   * every Agent a test creates or changes lives on a disposable School, which
//     the School cascade removes in afterAll (schoolFixtures).

const hash = () => randomBytes(32).toString('hex') // a SHA-256-shaped hex value
const prefix = () => randomBytes(12).toString('hex').slice(0, 16)
const SAFE = 'id, school_id, name, install_id, credential_prefix, status, revoked_at, previous_valid_until, activation_code_id'

const FIXTURE_A = { install_id: '0216a9e7-0000-4000-8000-00000000000a', credential_prefix: 'schemaFixtureA0216', name: 'School A Agent' }
const FIXTURE_B = { install_id: '0216a9e7-0000-4000-8000-00000000000b', credential_prefix: 'schemaFixtureB0216', name: 'School B Agent' }

type AgentFields = {
  school_id: string
  install_id?: string
  credential_prefix?: string
  credential_hash?: string
  name?: string
  activation_code_id?: string | null
}

describe('Attendance Agent schema (Machine Attendance Phase 3, slice 3A)', () => {
  let admin: SupabaseClient
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let grantStaff: SupabaseClient
  let noGrantStaff: SupabaseClient
  let schoolA: string
  let schoolB: string
  let scratch: string // disposable School for every Agent a test creates or changes
  let agentA: { id: string; install_id: string; credential_prefix: string }
  let agentB: { id: string }
  const madeCodesOnA: string[] = []
  const schools = schoolFixtures(() => admin)

  const schoolOf = async (owner: SupabaseClient) => {
    const { data: { user } } = await owner.auth.getUser()
    const { data } = await owner.from('profiles').select('school_id').eq('id', user!.id).single()
    return data!.school_id as string
  }

  /** Insert an Agent as Super Admin; returns only non-secret columns. */
  const insertAgent = async (fields: AgentFields) => {
    const row = {
      install_id: randomUUID(),
      credential_prefix: prefix(),
      credential_hash: hash(),
      name: 'Schema Test Agent',
      ...fields,
    }
    const { data, error } = await admin
      .from('attendance_agents')
      .insert(row)
      .select('id, install_id, credential_prefix')
      .single()
    return { data, error, row }
  }

  const insertCode = async (fields: Record<string, unknown>) => {
    const { data, error } = await admin
      .from('attendance_agent_activation_codes')
      .insert({ code_hash: hash(), expires_at: new Date(Date.now() + 3_600_000).toISOString(), ...fields })
      .select('id')
      .single()
    return { data, error }
  }

  const agentRow = async (client: SupabaseClient, id: string) =>
    (await client.from('attendance_agents_safe').select(SAFE).eq('id', id).maybeSingle()).data

  /** The seeded School's fixture Agent, reused if an earlier run created it. */
  const ensureFixtureAgent = async (school: string, fixture: typeof FIXTURE_A) => {
    const found = await admin
      .from('attendance_agents_safe')
      .select('id, install_id, credential_prefix, school_id, status')
      .eq('install_id', fixture.install_id)
      .maybeSingle()
    if (found.data) {
      expect(found.data).toMatchObject({ school_id: school, status: 'active' })
      return found.data
    }
    const created = await insertAgent({ school_id: school, ...fixture })
    expect(created.error).toBeNull()
    return created.data!
  }

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    schoolA = await schoolOf(ownerA)
    schoolB = await schoolOf(ownerB)
    await ensureStaffLogin(ownerA, { email: 'ma675-grant@test.local', fullName: 'MA675 Attendance Staff', screens: ['attendance'] })
    await ensureStaffLogin(ownerA, { email: 'ma675-nogrant@test.local', fullName: 'MA675 No Grant Staff' })
    grantStaff = await signedIn('ma675-grant@test.local')
    noGrantStaff = await signedIn('ma675-nogrant@test.local')

    agentA = await ensureFixtureAgent(schoolA, FIXTURE_A)
    agentB = await ensureFixtureAgent(schoolB, FIXTURE_B)
    scratch = await schools.create({ name: 'ZZ Agent Schema Test School' })
  })

  afterAll(async () => {
    // Unconsumed codes made on seeded School A can go; the fixture Agents stay
    // by design. The disposable School takes its Agents and codes with it.
    if (madeCodesOnA.length) await admin.from('attendance_agent_activation_codes').delete().in('id', madeCodesOnA)
    await schools.cleanup()
  })

  describe('School isolation through the safe view', () => {
    it('School A sees its own Agent metadata', async () => {
      const row = await agentRow(ownerA, agentA.id)
      expect(row).toMatchObject({ id: agentA.id, school_id: schoolA, name: 'School A Agent', status: 'active' })
      expect(row!.install_id).toBe(agentA.install_id)
      expect(row!.credential_prefix).toBe(agentA.credential_prefix)
    })

    it('School A cannot see School B Agents, and B cannot see A', async () => {
      expect(await agentRow(ownerA, agentB.id)).toBeNull()
      expect(await agentRow(ownerB, agentA.id)).toBeNull()
      const { data } = await ownerA.from('attendance_agents_safe').select('id, school_id')
      expect(data!.every((r) => r.school_id === schoolA)).toBe(true)
    })

    it('follows the Attendance grant: granted staff see the Agent, ungranted staff do not', async () => {
      expect(await agentRow(grantStaff, agentA.id)).not.toBeNull()
      expect(await agentRow(noGrantStaff, agentA.id)).toBeNull()
    })

    it('signed-out callers read nothing', async () => {
      const view = await anonClient().from('attendance_agents_safe').select('id')
      expect(view.error !== null || (view.data ?? []).length === 0).toBe(true)
      const base = await anonClient().from('attendance_agents').select('id')
      expect(base.error !== null || (base.data ?? []).length === 0).toBe(true)
    })

    it('the view does not carry verifier columns at all', async () => {
      expect((await ownerA.from('attendance_agents_safe').select('credential_hash').limit(1)).error).not.toBeNull()
      expect((await ownerA.from('attendance_agents_safe').select('previous_credential_hash').limit(1)).error).not.toBeNull()
    })
  })

  describe('hash columns are unreadable by every client role', () => {
    for (const [who, client] of [
      ['School Owner', () => ownerA],
      ['Attendance-grant staff', () => grantStaff],
      ['Super Admin', () => admin],
    ] as const) {
      it(`${who} cannot read credential_hash / previous_credential_hash from the base table`, async () => {
        const c = client()
        expect((await c.from('attendance_agents').select('credential_hash').eq('id', agentA.id)).error).not.toBeNull()
        expect((await c.from('attendance_agents').select('previous_credential_hash').eq('id', agentA.id)).error).not.toBeNull()
        expect((await c.from('attendance_agents').select('*').eq('id', agentA.id)).error).not.toBeNull()
      })
    }

    it('activation-code hashes are unreadable; the non-secret columns are readable to the School', async () => {
      const { data: code } = await insertCode({ school_id: schoolA })
      madeCodesOnA.push(code!.id)
      for (const c of [ownerA, grantStaff, admin]) {
        expect((await c.from('attendance_agent_activation_codes').select('code_hash').eq('id', code!.id)).error).not.toBeNull()
        expect((await c.from('attendance_agent_activation_codes').select('*').eq('id', code!.id)).error).not.toBeNull()
      }
      const own = await ownerA.from('attendance_agent_activation_codes').select('id, expires_at, consumed_at, revoked_at').eq('id', code!.id)
      expect(own.error).toBeNull()
      expect(own.data).toHaveLength(1)
      expect((await ownerB.from('attendance_agent_activation_codes').select('id').eq('id', code!.id)).data).toEqual([])
    })
  })

  describe('only Super Admin writes directly', () => {
    it('a School Owner cannot create an Agent or an activation code', async () => {
      const agent = await ownerA.from('attendance_agents').insert({
        school_id: schoolA, install_id: randomUUID(), credential_prefix: prefix(), credential_hash: hash(),
      })
      expect(agent.error).not.toBeNull()
      const code = await ownerA.from('attendance_agent_activation_codes').insert({
        school_id: schoolA, code_hash: hash(), expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      expect(code.error).not.toBeNull()
    })

    it('School members cannot update or revoke an Agent', async () => {
      for (const c of [ownerA, grantStaff]) {
        await c.from('attendance_agents').update({ name: 'hijacked' }).eq('id', agentA.id)
        await c.from('attendance_agents').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', agentA.id)
      }
      expect(await agentRow(ownerA, agentA.id)).toMatchObject({ name: 'School A Agent', status: 'active', revoked_at: null })
    })

    it('signed-out callers cannot write', async () => {
      const r = await anonClient().from('attendance_agents').insert({
        school_id: schoolA, install_id: randomUUID(), credential_prefix: prefix(), credential_hash: hash(),
      })
      expect(r.error).not.toBeNull()
    })
  })

  describe('no application role can delete an Agent (revoke, never delete)', () => {
    for (const [who, client] of [
      ['a School Owner', () => ownerA],
      ['Attendance-grant staff', () => grantStaff],
      ['Super Admin', () => admin],
    ] as const) {
      it(`${who} cannot delete an Agent`, async () => {
        const r = await client().from('attendance_agents').delete().eq('id', agentA.id)
        expect(r.error).not.toBeNull()
        expect(await agentRow(admin, agentA.id)).toMatchObject({ id: agentA.id, status: 'active' })
      })
    }

    it('a revoked Agent cannot be deleted either; it stays as history', async () => {
      const { data: agent } = await insertAgent({ school_id: scratch })
      await admin.from('attendance_agents').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', agent!.id)
      expect((await admin.from('attendance_agents').delete().eq('id', agent!.id)).error).not.toBeNull()
      expect(await agentRow(admin, agent!.id)).toMatchObject({ status: 'revoked' })
    })
  })

  describe('identity rules', () => {
    it('install_id cannot be changed', async () => {
      const { data: agent } = await insertAgent({ school_id: scratch })
      const r = await admin.from('attendance_agents').update({ install_id: randomUUID() }).eq('id', agent!.id)
      expect(r.error?.message).toMatch(/install_id is immutable/)
    })

    it('the credential prefix cannot be changed', async () => {
      const { data: agent } = await insertAgent({ school_id: scratch })
      const r = await admin.from('attendance_agents').update({ credential_prefix: prefix() }).eq('id', agent!.id)
      expect(r.error?.message).toMatch(/credential_prefix is immutable/)
    })

    it('an Agent cannot move to another School', async () => {
      const { data: agent } = await insertAgent({ school_id: scratch })
      const r = await admin.from('attendance_agents').update({ school_id: schoolA }).eq('id', agent!.id)
      expect(r.error).not.toBeNull()
    })

    it('a duplicate install_id or credential prefix is rejected', async () => {
      expect((await insertAgent({ school_id: scratch, install_id: agentA.install_id })).error).not.toBeNull()
      expect((await insertAgent({ school_id: scratch, credential_prefix: agentA.credential_prefix })).error).not.toBeNull()
    })

    it('hash columns accept only SHA-256 hex, never a plaintext secret', async () => {
      expect((await insertAgent({ school_id: scratch, credential_hash: 'my-local-secret' })).error).not.toBeNull()
      expect((await insertCode({ school_id: scratch, code_hash: 'ABCD-1234' })).error).not.toBeNull()
    })
  })

  describe('credential rotation state', () => {
    it('represents a current + previous verifier overlap under the same prefix', async () => {
      const oldHash = hash()
      const { data: agent } = await insertAgent({ school_id: scratch, credential_hash: oldHash })
      const until = new Date(Date.now() + 24 * 3_600_000).toISOString()
      const rotated = await admin
        .from('attendance_agents')
        .update({ credential_hash: hash(), previous_credential_hash: oldHash, previous_valid_until: until })
        .eq('id', agent!.id)
      expect(rotated.error).toBeNull()
      const row = await agentRow(admin, agent!.id)
      expect(row!.credential_prefix).toBe(agent!.credential_prefix)
      expect(new Date(row!.previous_valid_until!).toISOString()).toBe(until)
    })

    it('rejects a previous hash without a deadline, or equal to the current hash', async () => {
      const current = hash()
      const { data: agent } = await insertAgent({ school_id: scratch, credential_hash: current })
      expect((await admin.from('attendance_agents').update({ previous_credential_hash: hash() }).eq('id', agent!.id)).error).not.toBeNull()
      expect((await admin.from('attendance_agents').update({
        previous_credential_hash: current, previous_valid_until: new Date(Date.now() + 3_600_000).toISOString(),
      }).eq('id', agent!.id)).error).not.toBeNull()
    })
  })

  describe('revocation is a state, not a deletion', () => {
    it('a revoked Agent stays, and cannot be un-revoked', async () => {
      const { data: agent } = await insertAgent({ school_id: scratch })
      const revokedAt = new Date().toISOString()
      expect((await admin.from('attendance_agents').update({ status: 'revoked', revoked_at: revokedAt }).eq('id', agent!.id)).error).toBeNull()
      expect(await agentRow(admin, agent!.id)).toMatchObject({ status: 'revoked' })
      const back = await admin.from('attendance_agents').update({ status: 'active', revoked_at: null }).eq('id', agent!.id)
      expect(back.error?.message).toMatch(/cannot be changed back/)
    })

    it('status and revoked_at must agree', async () => {
      const { data: agent } = await insertAgent({ school_id: scratch })
      expect((await admin.from('attendance_agents').update({ status: 'revoked' }).eq('id', agent!.id)).error).not.toBeNull()
    })
  })

  describe('activation code lifecycle (on the disposable School)', () => {
    it('represents expired, revoked and open codes', async () => {
      const past = (ms: number) => new Date(Date.now() - ms).toISOString()
      const expired = await insertCode({ school_id: scratch, created_at: past(7_200_000), expires_at: past(3_600_000) })
      expect(expired.error).toBeNull()
      const revoked = await insertCode({ school_id: scratch })
      expect((await admin.from('attendance_agent_activation_codes').update({ revoked_at: new Date().toISOString() }).eq('id', revoked.data!.id)).error).toBeNull()
      const open = await insertCode({ school_id: scratch })
      expect(open.error).toBeNull()

      const { data } = await admin
        .from('attendance_agent_activation_codes')
        .select('id, expires_at, consumed_at, revoked_at')
        .in('id', [expired.data!.id, revoked.data!.id, open.data!.id])
      const byId = Object.fromEntries(data!.map((r) => [r.id, r]))
      expect(new Date(byId[expired.data!.id].expires_at).getTime()).toBeLessThan(Date.now())
      expect(byId[revoked.data!.id].revoked_at).not.toBeNull()
      expect(byId[open.data!.id]).toMatchObject({ consumed_at: null, revoked_at: null })

      // A revoked code stays revoked.
      expect((await admin.from('attendance_agent_activation_codes').update({ revoked_at: null }).eq('id', revoked.data!.id)).error).not.toBeNull()
    })

    it('a consumed code keeps its link to the Agent it activated, permanently', async () => {
      const code = (await insertCode({ school_id: scratch })).data!
      const agent = (await insertAgent({ school_id: scratch, activation_code_id: code.id })).data!
      expect((await admin.from('attendance_agent_activation_codes')
        .update({ consumed_at: new Date().toISOString(), consumed_by_agent_id: agent.id })
        .eq('id', code.id)).error).toBeNull()

      const { data: c } = await admin.from('attendance_agent_activation_codes').select('consumed_at, consumed_by_agent_id').eq('id', code.id).single()
      expect(c!.consumed_by_agent_id).toBe(agent.id)
      expect((await agentRow(admin, agent.id))!.activation_code_id).toBe(code.id)

      // The link cannot be undone, the code cannot then be revoked, and the code cannot be deleted.
      expect((await admin.from('attendance_agent_activation_codes').update({ consumed_by_agent_id: null, consumed_at: null }).eq('id', code.id)).error).not.toBeNull()
      expect((await admin.from('attendance_agent_activation_codes').update({ revoked_at: new Date().toISOString() }).eq('id', code.id)).error).not.toBeNull()
      expect((await admin.from('attendance_agents').update({ activation_code_id: null }).eq('id', agent.id)).error).not.toBeNull()
      expect((await admin.from('attendance_agent_activation_codes').delete().eq('id', code.id)).error).not.toBeNull()
    })

    it('consumption records the time and the Agent together', async () => {
      const code = (await insertCode({ school_id: scratch })).data!
      const half = await admin.from('attendance_agent_activation_codes').update({ consumed_at: new Date().toISOString() }).eq('id', code.id)
      expect(half.error).not.toBeNull()
    })

    it('an Agent cannot use another School\'s activation code', async () => {
      const code = (await insertCode({ school_id: scratch })).data!
      expect((await insertAgent({ school_id: schoolA, activation_code_id: code.id })).error).not.toBeNull()
    })
  })

  it('deleting a School still removes its Agents and codes (the cascade isolated tests rely on)', async () => {
    const temp = await schools.create({ name: 'ZZ Agent Schema Cascade School' })
    const code = (await insertCode({ school_id: temp })).data!
    const agent = (await insertAgent({ school_id: temp, activation_code_id: code.id })).data!
    await admin.from('attendance_agent_activation_codes').update({ consumed_at: new Date().toISOString(), consumed_by_agent_id: agent.id }).eq('id', code.id)
    await admin.from('attendance_agents').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', agent.id)
    expect((await admin.from('schools').delete().eq('id', temp)).error).toBeNull()
    expect(await agentRow(admin, agent.id)).toBeNull()
    expect((await admin.from('attendance_agent_activation_codes').select('id').eq('id', code.id)).data).toEqual([])
  })
})
