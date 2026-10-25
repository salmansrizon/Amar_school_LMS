import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { POST as activate } from '@/app/api/agent/v1/activate/route'
import { POST as rotate } from '@/app/api/agent/v1/credential/rotate/route'
import { POST as heartbeat } from '@/app/api/agent/v1/heartbeat/route'
import { GET as config } from '@/app/api/agent/v1/config/route'
import { POST as claim } from '@/app/api/agent/v1/commands/claim/route'
import { POST as result } from '@/app/api/agent/v1/commands/[id]/result/route'
import { POST as probeResult } from '@/app/api/agent/v1/devices/[id]/probe-result/route'
import { POST as credentialStatus } from '@/app/api/agent/v1/devices/[id]/credential-status/route'
import { signedIn } from '../helpers/auth'
import { schoolFixtures } from '../helpers/school-fixture'

// Machine Attendance Phase 6 (migration 0265, ADR 0033, Baseline §18.1, §22):
// the Agent-facing HTTP API, driven through the route handlers exactly as the
// Windows Agent calls them — JSON, Authorization: Bearer agt_<prefix>_<secret>,
// no cookies. The Agent's secret is generated here (as the Agent does) and only
// its sha256 verifier is ever sent to activation.

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const newSecret = () => randomBytes(32).toString('base64url')
const newPrefix = () => randomBytes(8).toString('hex')
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const newCode = () => Array.from(randomBytes(12), (b) => ALPHABET[b % 32]).join('')

type Identity = { installId: string; prefix: string; secret: string; verifier: string; credential: string }
const newIdentity = (): Identity => {
  const secret = newSecret()
  const prefix = newPrefix()
  return { installId: randomUUID(), prefix, secret, verifier: sha256(secret), credential: `agt_${prefix}_${secret}` }
}

const req = (url: string, init: { method?: string; body?: unknown; credential?: string; raw?: string } = {}) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (init.credential) headers.authorization = `Bearer ${init.credential}`
  return new Request(`http://localhost/api/agent/v1/${url}`, {
    method: init.method ?? 'POST',
    headers,
    body: init.method === 'GET' ? undefined : (init.raw ?? JSON.stringify(init.body ?? {})),
  })
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const activateBody = (who: Identity, code: string, extra: Record<string, unknown> = {}) => ({
  code,
  installId: who.installId,
  credentialPrefix: who.prefix,
  credentialVerifier: who.verifier,
  hostname: 'SCHOOL-PC-1',
  osInfo: 'Windows 10 Pro',
  agentVersion: '1.0.0',
  ...extra,
})

describe('Agent API /api/agent/v1 (Machine Attendance Phase 6)', () => {
  let admin: SupabaseClient
  let ownerA: SupabaseClient
  let scratch: string
  let other: string
  const schools = schoolFixtures(() => admin)

  /** An activation code for a School, inserted by Super Admin with a known plaintext. */
  const code = async (school: string, opts: { expired?: boolean } = {}) => {
    const plain = newCode()
    const { error } = await admin.from('attendance_agent_activation_codes').insert({
      school_id: school,
      code_hash: sha256(plain),
      expires_at: new Date(Date.now() + (opts.expired ? 1 : 24 * 3600) * 1000).toISOString(),
      ...(opts.expired ? { created_at: new Date(Date.now() - 3600 * 1000).toISOString() } : {}),
    })
    if (error) throw new Error(error.message)
    if (opts.expired) await new Promise((r) => setTimeout(r, 1200))
    return `${plain.slice(0, 4)}-${plain.slice(4, 8)}-${plain.slice(8)}`
  }

  /** Activates a fresh identity in a School; returns it with its agent id. */
  const activated = async (school: string) => {
    const who = newIdentity()
    const res = await activate(req('activate', { body: activateBody(who, await code(school)) }))
    expect(res.status).toBe(200)
    return { ...who, agentId: (await res.json()).agentId as string }
  }

  const machine = async (school: string, serial: string, agentId: string | null, fields: Record<string, unknown> = {}) => {
    const { data, error } = await admin
      .from('attendance_machines')
      .insert({
        school_id: school, machine_type: 'timmy', model: 'TM52GPRS', serial_number: serial, location: 'Agent API Gate',
        shift_scope: 'none', agent_id: agentId, host: '192.168.0.201', port: 5005, driver_key: 'timmy-sdk-fpclock', ...fields,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data.id as string
  }

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
    ownerA = await signedIn('owner-a@test.local')
    scratch = await schools.create({ name: 'ZZ Agent API Test School' })
    other = await schools.create({ name: 'ZZ Agent API Other School' })
  })

  afterAll(async () => {
    await schools.cleanup()
  })

  describe('activation', () => {
    it('activates with the verifier only, and the response carries no credential', async () => {
      const who = newIdentity()
      const res = await activate(req('activate', { body: activateBody(who, await code(scratch)) }))
      expect(res.status).toBe(200)
      const text = await res.text()
      const body = JSON.parse(text)
      expect(body.school.id).toBe(scratch)
      expect(body.agentId).toMatch(/^[0-9a-f-]{36}$/)
      expect(text).not.toContain(who.secret)
      expect(text).not.toContain(who.verifier)
      const { data } = await admin.from('attendance_agents_safe').select('*').eq('id', body.agentId).single()
      expect(data).toMatchObject({ install_id: who.installId, credential_prefix: who.prefix, hostname: 'SCHOOL-PC-1', status: 'active' })
      expect(JSON.stringify(data)).not.toContain(who.secret)
      // The new credential authenticates at once.
      expect((await config(req('config', { method: 'GET', credential: who.credential }))).status).toBe(200)
    })

    it('a lost response is retried safely: same identity, one Agent, the code consumed once', async () => {
      const who = newIdentity()
      const c = await code(scratch)
      const first = await (await activate(req('activate', { body: activateBody(who, c) }))).json()
      const retry = await activate(req('activate', { body: activateBody(who, c) }))
      expect(retry.status).toBe(200)
      expect((await retry.json()).agentId).toBe(first.agentId)
      const { data: rows } = await admin.from('attendance_agents_safe').select('id').eq('install_id', who.installId)
      expect(rows).toHaveLength(1)
      const { data: codeRow } = await admin.from('attendance_agent_activation_codes').select('consumed_by_agent_id').eq('consumed_by_agent_id', first.agentId)
      expect(codeRow).toHaveLength(1)
    })

    it('refuses the same installId with a different verifier or prefix (409), and creates nothing', async () => {
      const who = await activated(scratch)
      const c = await code(scratch)
      const otherSecret = newIdentity()
      expect((await activate(req('activate', { body: activateBody({ ...who, verifier: otherSecret.verifier }, c) }))).status).toBe(409)
      expect((await activate(req('activate', { body: activateBody({ ...who, prefix: newPrefix() }, c) }))).status).toBe(409)
      // The second code was not consumed: another installation can still use it.
      expect((await activate(req('activate', { body: activateBody(newIdentity(), c) }))).status).toBe(200)
    })

    it('a code consumed by another installation is not reusable (401)', async () => {
      const c = await code(scratch)
      expect((await activate(req('activate', { body: activateBody(newIdentity(), c) }))).status).toBe(200)
      expect((await activate(req('activate', { body: activateBody(newIdentity(), c) }))).status).toBe(401)
    })

    it('refuses an unknown or expired code, and a prefix already taken (before consuming the code)', async () => {
      expect((await activate(req('activate', { body: activateBody(newIdentity(), 'AAAA-BBBB-CCCC') }))).status).toBe(401)
      expect((await activate(req('activate', { body: activateBody(newIdentity(), await code(scratch, { expired: true })) }))).status).toBe(401)
      const taken = await activated(scratch)
      const c = await code(scratch)
      const res = await activate(req('activate', { body: activateBody({ ...newIdentity(), prefix: taken.prefix }, c) }))
      expect(res.status).toBe(409)
      expect((await activate(req('activate', { body: activateBody(newIdentity(), c) }))).status).toBe(200) // code still unused
    })

    it('rejects malformed requests (400) and never echoes them', async () => {
      const who = newIdentity()
      for (const body of [
        activateBody(who, await code(scratch), { installId: 'not-a-uuid' }),
        activateBody(who, await code(scratch), { credentialVerifier: who.secret }), // the raw secret is not a verifier
        activateBody(who, await code(scratch), { credentialPrefix: 'bad prefix!' }),
        { code: 'x' },
      ]) {
        const res = await activate(req('activate', { body }))
        expect(res.status).toBe(400)
        expect(await res.text()).not.toContain(who.secret)
      }
      expect((await activate(req('activate', { raw: '{not json' }))).status).toBe(400)
      expect((await activate(req('activate', { raw: JSON.stringify({ pad: 'x'.repeat(5000) }) }))).status).toBe(413)
    })

    it('a School user creates a code through the RPC; it is shown once and stored only as a hash', async () => {
      const { data, error } = await ownerA.rpc('create_attendance_agent_activation_code')
      expect(error).toBeNull()
      const row = (data as { code: string; expires_at: string }[])[0]!
      expect(row.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/)
      const hash = sha256(row.code.replaceAll('-', ''))
      const { data: stored } = await admin.from('attendance_agent_activation_codes').select('id, expires_at').eq('expires_at', row.expires_at)
      expect(stored?.length).toBeGreaterThan(0)
      expect(JSON.stringify(stored)).not.toContain(row.code)
      // Clean up: an unconsumed code may be deleted by Super Admin.
      await admin.from('attendance_agent_activation_codes').delete().eq('code_hash', hash)
    })
  })

  describe('credential', () => {
    it('refuses missing, malformed and wrong credentials on every Agent route (401)', async () => {
      const who = await activated(scratch)
      const m = await machine(scratch, `API-AUTH-${randomUUID()}`, who.agentId)
      for (const credential of [undefined, 'agt_short', `agt_${who.prefix}_${newSecret()}`, `agt_${newPrefix()}_${who.secret}`]) {
        expect((await config(req('config', { method: 'GET', credential }))).status).toBe(401)
        expect((await heartbeat(req('heartbeat', { credential, body: { health: {} } }))).status).toBe(401)
        expect((await claim(req('commands/claim', { credential, body: { max: 1 } }))).status).toBe(401)
        expect((await probeResult(req(`devices/${m}/probe-result`, { credential, body: { info: {}, capabilities: {}, credentialConfigured: false } }), params(m))).status).toBe(401)
        expect((await credentialStatus(req(`devices/${m}/credential-status`, { credential, body: { credentialConfigured: true } }), params(m))).status).toBe(401)
      }
    })

    it('a revoked Agent can no longer authenticate; its machines are unassigned and its work cancelled', async () => {
      const who = await activated(scratch)
      const m = await machine(scratch, `API-REV-${randomUUID()}`, who.agentId)
      const cmd = await admin.rpc('request_attendance_machine_test', { machine_id: m })
      expect(cmd.error).toBeNull()
      expect((await admin.rpc('revoke_attendance_agent', { agent_id: who.agentId })).error).toBeNull()
      expect((await config(req('config', { method: 'GET', credential: who.credential }))).status).toBe(401)
      expect((await heartbeat(req('heartbeat', { credential: who.credential, body: { health: {} } }))).status).toBe(401)
      const { data: mRow } = await admin.from('attendance_machines').select('agent_id').eq('id', m).single()
      expect(mRow!.agent_id).toBeNull()
      const { data: c } = await admin.from('machine_commands').select('status').eq('id', cmd.data).single()
      expect(c!.status).toBe('cancelled')
      // Re-activating the same installation is refused too.
      expect((await activate(req('activate', { body: activateBody(who, await code(scratch)) }))).status).toBe(401)
    })

    it('rotation: a new verifier under the unchanged prefix; the old secret works until the overlap ends', async () => {
      const who = await activated(scratch)
      const next = newSecret()
      const res = await rotate(req('credential/rotate', { credential: who.credential, body: { newVerifier: sha256(next) } }))
      expect(res.status).toBe(200)
      expect(Date.parse((await res.json()).previousValidUntil)).toBeGreaterThan(Date.now())
      const newCredential = `agt_${who.prefix}_${next}`
      expect((await config(req('config', { method: 'GET', credential: newCredential }))).status).toBe(200)
      expect((await config(req('config', { method: 'GET', credential: who.credential }))).status).toBe(200) // overlap
      // Repeating the same rotation (lost response) is a no-op; a different one during the overlap is refused.
      expect((await rotate(req('credential/rotate', { credential: who.credential, body: { newVerifier: sha256(next) } }))).status).toBe(200)
      expect((await rotate(req('credential/rotate', { credential: newCredential, body: { newVerifier: sha256(newSecret()) } }))).status).toBe(409)
      // A body naming a prefix is refused: the prefix never changes.
      expect((await rotate(req('credential/rotate', { credential: newCredential, body: { newVerifier: sha256(newSecret()), credentialPrefix: newPrefix() } }))).status).toBe(400)
      // After the overlap the old secret is refused.
      await admin.from('attendance_agents').update({ previous_valid_until: new Date(Date.now() - 1000).toISOString() }).eq('id', who.agentId)
      expect((await config(req('config', { method: 'GET', credential: who.credential }))).status).toBe(401)
      expect((await config(req('config', { method: 'GET', credential: newCredential }))).status).toBe(200)
    })
  })

  describe('config', () => {
    it('lists only enabled, non-archived machines of this Agent, with no secret, plus archived ids', async () => {
      const who = await activated(scratch)
      const otherAgent = await activated(scratch)
      const live = await machine(scratch, `API-CFG-LIVE-${randomUUID()}`, who.agentId)
      const disabled = await machine(scratch, `API-CFG-OFF-${randomUUID()}`, who.agentId, { enabled: false })
      const archived = await machine(scratch, `API-CFG-ARC-${randomUUID()}`, who.agentId)
      await admin.rpc('archive_attendance_machine', { machine_id: archived })
      const notMine = await machine(scratch, `API-CFG-OTHER-${randomUUID()}`, otherAgent.agentId)

      const res = await config(req('config', { method: 'GET', credential: who.credential }))
      expect(res.status).toBe(200)
      const text = await res.text()
      const body = JSON.parse(text)
      expect(body.agentId).toBe(who.agentId)
      expect(body.devices.map((d: { id: string }) => d.id)).toEqual([live])
      expect(body.devices[0]).toMatchObject({
        id: live, manufacturer: 'timmy', model: 'TM52GPRS', host: '192.168.0.201', port: 5005,
        driverKey: 'timmy-sdk-fpclock', enabled: true,
      })
      expect(body.devices[0].timeZone).toBeTruthy()
      expect(body.archivedDeviceIds).toEqual([archived])
      expect(text).not.toContain(disabled)
      expect(text).not.toContain(notMine)
      expect(text).not.toMatch(/key|password|secret|credential/i)
      expect(body.configVersion).toMatch(/^[0-9a-f]{32}$/)
    })
  })

  describe('heartbeat', () => {
    it('records liveness and normalized health; returns the config version', async () => {
      const who = await activated(scratch)
      const health = { installId: who.installId, agentVersion: '1.0.0', devices: [], upload: { pendingEvents: 3 } }
      const res = await heartbeat(req('heartbeat', { credential: who.credential, body: { health, agentVersion: '1.0.1' } }))
      expect(res.status).toBe(200)
      const body = await res.json()
      const cfg = await (await config(req('config', { method: 'GET', credential: who.credential }))).json()
      expect(body.configVersion).toBe(cfg.configVersion)
      const { data } = await admin.from('attendance_agents_safe').select('last_heartbeat_at, last_health, agent_version').eq('id', who.agentId).single()
      expect(data!.last_heartbeat_at).not.toBeNull()
      expect(data!.last_health).toMatchObject({ upload: { pendingEvents: 3 } })
      expect(data!.agent_version).toBe('1.0.1')
      expect((await heartbeat(req('heartbeat', { credential: who.credential, body: { health: [] } }))).status).toBe(400)
    })
  })

  describe('devices', () => {
    it('probe-result stores normalized facts for this Agent machine only; serial verified once', async () => {
      const who = await activated(scratch)
      const intruder = await activated(other)
      const serial = `API-PROBE-${randomUUID()}`
      const m = await machine(scratch, serial, who.agentId, { driver_key: 'auto' })
      const capabilities = { canDeleteUsers: false, canCreateUsersWithoutCard: false, canClearCardKeepingUser: false, canReadAttendance: true }
      const body = (s: string) => ({ info: { serialNumber: s, driverKey: 'timmy-sdk-fpclock' }, capabilities, credentialConfigured: true })

      expect((await probeResult(req(`devices/${m}/probe-result`, { credential: intruder.credential, body: body(serial) }), params(m))).status).toBe(404)
      const res = await probeResult(req(`devices/${m}/probe-result`, { credential: who.credential, body: body(serial.toLowerCase()) }), params(m))
      expect(res.status).toBe(200)
      expect((await res.json()).serial).toBe('verified')
      const { data } = await admin.from('attendance_machines').select('probed_serial, serial_verified_at, capabilities, credential_configured, driver_key').eq('id', m).single()
      expect(data).toMatchObject({ probed_serial: serial.toLowerCase(), credential_configured: true, driver_key: 'timmy-sdk-fpclock', capabilities })
      // A different serial later is a mismatch and changes nothing.
      const again = await probeResult(req(`devices/${m}/probe-result`, { credential: who.credential, body: body('SOMETHING-ELSE') }), params(m))
      expect((await again.json()).serial).toBe('serial_mismatch')
      expect((await admin.from('attendance_machines').select('probed_serial').eq('id', m).single()).data!.probed_serial).toBe(serial.toLowerCase())
      expect((await probeResult(req(`devices/${m}/probe-result`, { credential: who.credential, body: { info: [], capabilities, credentialConfigured: true } }), params(m))).status).toBe(400)
    })

    it('credential-status is yes/no for this Agent machine only; archived machines and other Agents are refused', async () => {
      const who = await activated(scratch)
      const otherAgent = await activated(scratch)
      const m = await machine(scratch, `API-CRED-${randomUUID()}`, who.agentId)
      const notMine = await machine(scratch, `API-CRED-OTHER-${randomUUID()}`, otherAgent.agentId)
      expect((await credentialStatus(req(`devices/${m}/credential-status`, { credential: who.credential, body: { credentialConfigured: true } }), params(m))).status).toBe(200)
      expect((await admin.from('attendance_machines').select('credential_configured').eq('id', m).single()).data!.credential_configured).toBe(true)
      expect((await credentialStatus(req(`devices/${notMine}/credential-status`, { credential: who.credential, body: { credentialConfigured: true } }), params(notMine))).status).toBe(404)
      expect((await credentialStatus(req(`devices/${m}/credential-status`, { credential: who.credential, body: { credentialConfigured: true, key: '4321' } }), params(m))).status).toBe(400)
      await admin.rpc('archive_attendance_machine', { machine_id: m })
      expect((await credentialStatus(req(`devices/${m}/credential-status`, { credential: who.credential, body: { credentialConfigured: false } }), params(m))).status).toBe(404)
    })
  })

  describe('commands and Test Connection', () => {
    it('TEST_CONNECTION: created by the School, claimed by the Agent, completed once, stale claims refused', async () => {
      const who = await activated(scratch)
      const m = await machine(scratch, `API-TEST-${randomUUID()}`, who.agentId)
      const created = await admin.rpc('request_attendance_machine_test', { machine_id: m })
      expect(created.error).toBeNull()
      // An open test is reused, not duplicated.
      expect((await admin.rpc('request_attendance_machine_test', { machine_id: m })).data).toBe(created.data)

      const claimed = await (await claim(req('commands/claim', { credential: who.credential, body: { max: 10 } }))).json()
      const c = claimed.commands.find((x: { id: string }) => x.id === created.data)
      expect(c).toMatchObject({ type: 'TEST_CONNECTION', machineId: m, attempt: 1 })
      expect(c.claimToken).toMatch(/^[0-9a-f-]{36}$/)

      const outcome = { reachable: true, identity: { serialNumber: 'tmbd52120878', driverKey: 'timmy-sdk-fpclock' }, elapsedMs: 1200 }
      const done = await result(req(`commands/${c.id}/result`, { credential: who.credential, body: { claimToken: c.claimToken, status: 'succeeded', result: outcome } }), params(c.id))
      expect((await done.json()).ack).toBe('completed')
      const repeat = await result(req(`commands/${c.id}/result`, { credential: who.credential, body: { claimToken: c.claimToken, status: 'succeeded', result: outcome } }), params(c.id))
      expect((await repeat.json()).ack).toBe('already_completed')
      const stale = await result(req(`commands/${c.id}/result`, { credential: who.credential, body: { claimToken: randomUUID(), status: 'failed', errorClass: 'unreachable' } }), params(c.id))
      expect((await stale.json()).ack).toBe('stale')
      const { data } = await admin.from('machine_commands').select('status, result').eq('id', c.id).single()
      expect(data).toMatchObject({ status: 'succeeded', result: outcome })
    })

    it('another Agent cannot claim or complete the command; malformed results are refused', async () => {
      const who = await activated(scratch)
      const intruder = await activated(other)
      const m = await machine(scratch, `API-TEST2-${randomUUID()}`, who.agentId)
      const created = (await admin.rpc('request_attendance_machine_test', { machine_id: m })).data as string
      const theirs = await (await claim(req('commands/claim', { credential: intruder.credential, body: { max: 100 } }))).json()
      expect(theirs.commands.map((x: { id: string }) => x.id)).not.toContain(created)
      const mine = (await (await claim(req('commands/claim', { credential: who.credential, body: { max: 100 } }))).json()).commands
        .find((x: { id: string }) => x.id === created)
      expect((await result(req(`commands/${created}/result`, { credential: intruder.credential, body: { claimToken: mine.claimToken, status: 'succeeded' } }), params(created))).status).toBe(404)
      expect((await result(req(`commands/${created}/result`, { credential: who.credential, body: { claimToken: mine.claimToken, status: 'failed' } }), params(created))).status).toBe(400)
      expect((await result(req(`commands/${created}/result`, { credential: who.credential, body: { claimToken: mine.claimToken, status: 'failed', errorClass: 'exploded' } }), params(created))).status).toBe(400)
      expect((await claim(req('commands/claim', { credential: who.credential, body: { max: 1000 } }))).status).toBe(400)
    })

    it('Test Connection is refused for a disabled machine, an archived one and one without an active Agent', async () => {
      const who = await activated(scratch)
      const off = await machine(scratch, `API-TEST-OFF-${randomUUID()}`, who.agentId, { enabled: false })
      const none = await machine(scratch, `API-TEST-NONE-${randomUUID()}`, null)
      expect((await admin.rpc('request_attendance_machine_test', { machine_id: off })).error?.message).toMatch(/not in service/)
      expect((await admin.rpc('request_attendance_machine_test', { machine_id: none })).error?.message).toMatch(/no active agent/)
      // A School user of another School cannot reach the machine at all.
      expect((await ownerA.rpc('request_attendance_machine_test', { machine_id: none })).error?.code).toBe('P0002')
    })
  })
})
