import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { POST as activate } from '@/app/api/agent/v1/activate/route'
import { POST as claim } from '@/app/api/agent/v1/commands/claim/route'
import { POST as result } from '@/app/api/agent/v1/commands/[id]/result/route'
import { signedIn, anonClient, PASSWORD } from '../helpers/auth'
import { ensureStaffLogin } from '../helpers/staff'
import { schoolFixtures } from '../helpers/school-fixture'

// Machine Attendance Phase 9 (migration 0269, Baseline §14): provisioning
// students onto machines. enqueue_attendance_provisioning plans and writes
// episodes + PROVISION_PERSON commands; the Agent's verified result (through
// the real /api/agent/v1 routes) links the episode. Everything is in a
// disposable School except the authorization checks, which run against
// School A's fixtures and write nothing there.

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const TM52 = {
  canWriteUsers: true, canReadUsers: true, canWriteRfid: true, canDeleteUsers: false, canCreateUsersWithoutCard: false,
  canClearCardKeepingUser: false, maxMachineUserIdDigits: 8, maxNameLength: 18, supportsUnicodeNames: false,
  maxCardValue: 4294967295, cardPreservesLeadingZeros: false,
}

type Outcome = { queued: { personId: string; machineId: string; enrollmentId: string; desiredVersion: number; outcome: string }[]; skipped: { personId: string; machineId: string; reason: string }[] }

describe('student provisioning (Phase 9)', () => {
  let admin: SupabaseClient
  let school: string
  let credential: string
  let agentId: string
  let m1: string
  const schools = schoolFixtures(() => admin)

  const req = (url: string, body: unknown) => new Request(`http://localhost/api/agent/v1/${url}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}` }, body: JSON.stringify(body),
  })
  const enqueue = async (c: SupabaseClient, people: string[], machines: string[], existingOnly = false) => {
    const { data, error } = await c.rpc('enqueue_attendance_provisioning', { entity_type: 'student', person_ids: people, machine_ids: machines, existing_only: existingOnly })
    if (error) throw new Error(error.message)
    return data as Outcome
  }
  const of = (o: Outcome, person: string, machine: string) =>
    o.queued.find((q) => q.personId === person && q.machineId === machine)?.outcome
    ?? o.skipped.find((s) => s.personId === person && s.machineId === machine)?.reason
  const episode = async (person: string, machine: string) =>
    (await admin.from('attendance_machine_enrollments').select('*').eq('student_id', person).eq('machine_id', machine).order('created_at')).data!
  const machine = async (caps: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
    const { data, error } = await admin.from('attendance_machines').insert({
      school_id: school, machine_type: 'timmy', model: 'TM52GPRS', serial_number: `P9-${randomUUID().slice(0, 8)}`, location: 'Phase 9 Gate',
      shift_scope: 'none', agent_id: agentId, capabilities: caps, ...extra,
    }).select('id').single()
    if (error) throw new Error(error.message)
    return data.id as string
  }
  const student = async (name: string, card?: string | null, archived = false) => {
    const { data: s } = await admin.from('students').insert({ school_id: school, full_name: name }).select('id, unique_id').single()
    if (card !== undefined) await admin.from('machine_enroll_infos').insert({ school_id: school, type: 'student', student_id: s!.id, unique_id: s!.unique_id, rfid_card_number: card })
    if (archived) await admin.from('students').update({ archived_at: new Date().toISOString() }).eq('id', s!.id)
    return s as { id: string; unique_id: number }
  }
  /** The Agent: claim, then report. `verified` false = a result the cloud must not link on. */
  const agentRuns = async (commandId: string, outcome: 'succeeded' | 'failed', body: Record<string, unknown> = {}) => {
    const claimed = await (await claim(req('commands/claim', { max: 50 }))).json()
    const c = claimed.commands.find((x: { id: string }) => x.id === commandId)
    expect(c, 'command claimed').toBeTruthy()
    const res = await result(req(`commands/${commandId}/result`, { claimToken: c.claimToken, status: outcome, ...body }), { params: Promise.resolve({ id: commandId }) })
    return { payload: c.payload, ack: (await res.json()).ack as string }
  }

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
    school = await schools.create({ name: 'ZZ Provisioning Test School' })
    const plain = Array.from(randomBytes(12), (b) => ALPHABET[b % 32]).join('')
    await admin.from('attendance_agent_activation_codes').insert({ school_id: school, code_hash: sha256(plain), expires_at: new Date(Date.now() + 3600_000).toISOString() })
    const secret = randomBytes(32).toString('base64url')
    const prefix = randomBytes(8).toString('hex')
    const res = await activate(new Request('http://localhost/api/agent/v1/activate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: plain, installId: randomUUID(), credentialPrefix: prefix, credentialVerifier: sha256(secret) }),
    }))
    agentId = (await res.json()).agentId
    credential = `agt_${prefix}_${secret}`
    m1 = await machine(TM52)
  })

  afterAll(async () => {
    await schools.cleanup()
  })

  it('first enrollment opens a pending episode and queues one PROVISION_PERSON; a repeat queues nothing', async () => {
    const s = await student('Rahim Uddin Chowdhury Ahmed', '0004972001')
    const first = await enqueue(admin, [s.id], [m1])
    expect(of(first, s.id, m1)).toBe('created')
    const [ep] = await episode(s.id, m1)
    expect(ep).toMatchObject({ sync_state: 'pending', linked_at: null, desired_version: 1, machine_user_id: String(s.unique_id) })
    const { data: cmd } = await admin.from('machine_commands').select('type, status, payload, idempotency_key, agent_id').eq('id', ep.last_command_id).single()
    expect(cmd).toMatchObject({ type: 'PROVISION_PERSON', status: 'pending', agent_id: agentId, idempotency_key: `provision:${ep.id}:1` })
    expect(cmd!.payload).toEqual({ machineUserId: String(s.unique_id), name: 'Rahim Uddin Chowdh', card: '0004972001', privilege: 'user', entityType: 'student', enrollmentRowId: ep.id, desiredVersion: 1 })
    expect(of(await enqueue(admin, [s.id], [m1]), s.id, m1)).toBe('alreadyPending')
    expect((await admin.from('machine_commands').select('id').eq('machine_id', m1).eq('payload->>enrollmentRowId', ep.id)).data).toHaveLength(1)
  })

  it('only a verified read-back links the episode; an unverified success fails it', async () => {
    const s = await student('Unverified Student', '1234567')
    await enqueue(admin, [s.id], [m1])
    let [ep] = await episode(s.id, m1)
    const run = await agentRuns(ep.last_command_id, 'succeeded', { result: { machineUserId: String(s.unique_id), storedCard: '1234567', name: 'Unverified Student' } })
    expect(run.ack).toBe('completed')
    ;[ep] = await episode(s.id, m1)
    expect(ep).toMatchObject({ sync_state: 'failed', linked_at: null })

    // Retried; this time the Agent verified it.
    expect(of(await enqueue(admin, [s.id], [m1]), s.id, m1)).toBe('retried')
    ;[ep] = await episode(s.id, m1)
    await agentRuns(ep.last_command_id, 'succeeded', { result: { machineUserId: String(s.unique_id), outcome: 'created', storedCard: '1234567', name: 'Unverified Student', verified: true } })
    ;[ep] = await episode(s.id, m1)
    expect(ep).toMatchObject({ sync_state: 'synced', last_synced_card: '1234567', last_synced_name: 'Unverified Student', desired_version: 2 })
    expect(ep.linked_at).not.toBeNull()
    expect(of(await enqueue(admin, [s.id], [m1]), s.id, m1)).toBe('unchanged')
  })

  it('a device failure leaves the episode unlinked and failed, with the error', async () => {
    const s = await student('Failing Student', '7654321')
    await enqueue(admin, [s.id], [m1])
    const [ep] = await episode(s.id, m1)
    await agentRuns(ep.last_command_id, 'failed', { errorClass: 'unreachable', errorDetail: 'Nothing answered' })
    const [after] = await episode(s.id, m1)
    expect(after).toMatchObject({ sync_state: 'failed', linked_at: null, last_error: 'unreachable: Nothing answered' })
  })

  it('a card replacement bumps the SAME episode; its history window stays; the device form compares numerically', async () => {
    const s = await student('Card Change Student', '0004972001')
    await enqueue(admin, [s.id], [m1])
    let [ep] = await episode(s.id, m1)
    await agentRuns(ep.last_command_id, 'succeeded', { result: { machineUserId: String(s.unique_id), storedCard: '4972001', name: 'Card Change Studen', verified: true } })
    ;[ep] = await episode(s.id, m1)
    const linkedAt = ep.linked_at
    expect(of(await enqueue(admin, [s.id], [m1]), s.id, m1)).toBe('unchanged') // 0004972001 == 4972001 on this device

    await admin.from('machine_enroll_infos').update({ rfid_card_number: '0013646760' }).eq('student_id', s.id)
    expect(of(await enqueue(admin, [s.id], [m1], true), s.id, m1)).toBe('updated')
    const episodes = await episode(s.id, m1)
    expect(episodes).toHaveLength(1)
    expect(episodes[0]).toMatchObject({ id: ep.id, desired_version: 2, sync_state: 'pending', linked_at: linkedAt })
    await agentRuns(episodes[0].last_command_id, 'succeeded', { result: { machineUserId: String(s.unique_id), storedCard: '13646760', name: 'Card Change Studen', verified: true } })
    const [synced] = await episode(s.id, m1)
    expect(synced).toMatchObject({ id: ep.id, sync_state: 'synced', last_synced_card: '13646760', linked_at: linkedAt })
  })

  it('card cleared in the LMS: the episode stays open and linked; removal is reported as manual, never queued', async () => {
    const s = await student('Cleared Card Student', '5550001')
    await enqueue(admin, [s.id], [m1])
    const [ep] = await episode(s.id, m1)
    await agentRuns(ep.last_command_id, 'succeeded', { result: { machineUserId: String(s.unique_id), storedCard: '5550001', name: 'Cleared Card Studen', verified: true } })
    await admin.from('machine_enroll_infos').delete().eq('student_id', s.id)
    expect(of(await enqueue(admin, [s.id], [m1]), s.id, m1)).toBe('errManualRemovalRequired')
    const [after] = await episode(s.id, m1)
    expect(after).toMatchObject({ unlinked_at: null, desired_state: 'present', sync_state: 'synced', enroll_info_id: null })
    expect(after.linked_at).not.toBeNull()
    expect((await admin.from('machine_commands').select('id').eq('machine_id', m1).eq('type', 'REMOVE_PERSON')).data).toEqual([])
  })

  it('eligibility and capability reasons are returned, never silently skipped', async () => {
    const archived = await student('Archived', '1111', true)
    const noRow = await student('No Card')
    const letters = await student('Letters', 'ABC123')
    const huge = await student('Huge', '9999999999')
    const r = await enqueue(admin, [archived.id, noRow.id, letters.id, huge.id], [m1])
    expect([of(r, archived.id, m1), of(r, noRow.id, m1), of(r, letters.id, m1), of(r, huge.id, m1)])
      .toEqual(['errNotEligible', 'errNotEligible', 'errInvalidCard', 'errInvalidCard'])
    const mOff = await machine(TM52, { enabled: false })
    const mUnprobed = await machine({})
    const mNarrow = await machine({ ...TM52, maxMachineUserIdDigits: 1 })
    const ok = await student('Ok Student', '2222')
    const r2 = await enqueue(admin, [ok.id], [mOff, mUnprobed, mNarrow])
    expect([of(r2, ok.id, mOff), of(r2, ok.id, mUnprobed), of(r2, ok.id, mNarrow)]).toEqual(['errMachineNotInService', 'errCapabilitiesUnknown', 'errMachineIdTooWide'])
    const archivedMachine = await machine(TM52)
    expect((await admin.rpc('archive_attendance_machine', { machine_id: archivedMachine })).error).toBeNull()
    expect(of(await enqueue(admin, [ok.id], [archivedMachine]), ok.id, archivedMachine)).toBe('errMachineNotInService')
  })

  it('re-enrollment after the machine was archived and restored opens a NEW episode; the closed one is untouched', async () => {
    const mx = await machine(TM52)
    const s = await student('Restore Student', '3333')
    await enqueue(admin, [s.id], [mx])
    const [first] = await episode(s.id, mx)
    await agentRuns(first.last_command_id, 'succeeded', { result: { machineUserId: String(s.unique_id), storedCard: '3333', name: 'Restore Student', verified: true } })
    expect((await admin.rpc('archive_attendance_machine', { machine_id: mx })).error).toBeNull()
    const [closed] = await episode(s.id, mx)
    expect(closed.unlinked_at).not.toBeNull()
    expect((await admin.rpc('restore_attendance_machine', { machine_id: mx })).error).toBeNull()
    expect(of(await enqueue(admin, [s.id], [mx]), s.id, mx)).toBe('retried') // 0264 already opened the new pending episode; it gets its command
    const all = await episode(s.id, mx)
    expect(all).toHaveLength(2)
    expect(all[0]).toMatchObject({ id: first.id, unlinked_at: closed.unlinked_at, linked_at: closed.linked_at })
    expect(all[1]).toMatchObject({ linked_at: null, unlinked_at: null })
  })

  describe('authorization (School A fixtures; nothing is written there)', () => {
    let ownerA: SupabaseClient
    let ownerB: SupabaseClient
    let office: SupabaseClient
    let teacher: SupabaseClient
    let fixtureMachine: string
    let schoolAStudent: string
    let teacherGrantAdded = false
    let teacherId: string

    beforeAll(async () => {
      ownerA = await signedIn('owner-a@test.local')
      ownerB = await signedIn('owner-b@test.local')
      await ensureStaffLogin(ownerA, { email: 'ma675-grant@test.local', fullName: 'MA675 Attendance Staff', screens: ['attendance'] })
      office = await signedIn('ma675-grant@test.local')
      teacher = await signedIn('teacher-e2e@test.local', PASSWORD)
      teacherId = (await teacher.auth.getUser()).data.user!.id
      teacherGrantAdded = !(await ownerA.from('staff_permissions').insert({ staff_user_id: teacherId, screen_key: 'attendance' })).error
      fixtureMachine = (await admin.from('attendance_machines').select('id').eq('serial_number', 'EPI-FIXTURE-A').single()).data!.id
      schoolAStudent = (await ownerA.from('students').select('id').limit(1).single()).data!.id
    })

    afterAll(async () => {
      if (teacherGrantAdded) await ownerA.from('staff_permissions').delete().eq('staff_user_id', teacherId).eq('screen_key', 'attendance')
    })

    const count = async () => ((await admin.from('attendance_machine_enrollments').select('id', { count: 'exact', head: true }).eq('machine_id', fixtureMachine)).count ?? 0)
      + ((await admin.from('machine_commands').select('id', { count: 'exact', head: true }).eq('machine_id', fixtureMachine).eq('type', 'PROVISION_PERSON')).count ?? 0)

    it('a teacher with the Attendance grant and another School are refused; Owner and office staff get past authorization', async () => {
      const before = await count()
      expect(of(await enqueue(teacher, [schoolAStudent], [fixtureMachine]), schoolAStudent, fixtureMachine)).toBe('errMachineNotFound')
      expect(of(await enqueue(ownerB, [schoolAStudent], [fixtureMachine]), schoolAStudent, fixtureMachine)).toBe('errMachineNotFound')
      // Authorized callers reach the machine's own state (its Agent / capabilities), proving the rule let them in.
      for (const c of [ownerA, office]) {
        expect(of(await enqueue(c, [schoolAStudent], [fixtureMachine]), schoolAStudent, fixtureMachine)).not.toBe('errMachineNotFound')
      }
      expect(await count()).toBe(before)
    })

    it('anon cannot call it; another School\'s person is not found', async () => {
      expect((await anonClient().rpc('enqueue_attendance_provisioning', { entity_type: 'student', person_ids: [schoolAStudent], machine_ids: [m1] })).error).not.toBeNull()
      expect(of(await enqueue(admin, [schoolAStudent], [m1]), schoolAStudent, m1)).toBe('errNotFound')
    })
  })
})
