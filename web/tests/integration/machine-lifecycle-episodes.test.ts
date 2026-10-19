import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, anonClient } from '../helpers/auth'
import { schoolFixtures } from '../helpers/school-fixture'

// Machine Attendance Phase 3 (migration 0264, ADR 0033, Baseline §17.3-17.4):
// archive / restore / replace carry enrollment episodes and machine commands.
// Archive closes open episodes (linked ones at the archive time, pending ones
// as cancelled) and cancels unfinished commands; restore and replace give
// everyone still desired a NEW pending episode; history is never rewritten.
// Everything runs on a disposable School; Super Admin stands in for the
// provisioning engine (episodes) and the feature functions (commands).

const RECONCILE_SECRET = process.env.RECONCILE_SECRET!
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const LONG_AGO = '2026-09-01T00:00:00+00:00'

type Episode = {
  id: string
  machine_id: string
  machine_user_id: string
  student_id: string | null
  linked_at: string | null
  unlinked_at: string | null
  sync_state: string
  desired_state: string
}

describe('machine lifecycle carries episodes and commands (Machine Attendance Phase 3)', () => {
  let admin: SupabaseClient
  let school: string
  let agent: { id: string; credential: string }
  let students: string[]
  let userSeq = 0
  const schools = schoolFixtures(() => admin)

  const nextUser = () => `7777${String(1000 + ++userSeq)}`

  const makeMachine = async (serial: string) => {
    const { data, error } = await admin
      .from('attendance_machines')
      .insert({ school_id: school, machine_type: 'zkteco', model: 'K40', serial_number: serial, location: 'Lifecycle Gate', shift_scope: 'none', agent_id: agent.id })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data.id as string
  }

  const addEpisode = async (machine: string, row: Record<string, unknown>) => {
    const { data, error } = await admin
      .from('attendance_machine_enrollments')
      .insert({ school_id: school, machine_id: machine, entity_type: 'student', ...row })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data.id as string
  }

  const episodes = async (machine: string): Promise<Episode[]> =>
    ((await admin
      .from('attendance_machine_enrollments')
      .select('id, machine_id, machine_user_id, student_id, linked_at, unlinked_at, sync_state, desired_state')
      .eq('machine_id', machine)
      .order('created_at')).data ?? []) as Episode[]

  const addCommand = async (machine: string | null, type = 'TEST_CONNECTION') => {
    const { data, error } = await admin
      .from('machine_commands')
      .insert({ school_id: school, agent_id: agent.id, machine_id: machine, type, idempotency_key: `lc:${randomUUID()}` })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data.id as string
  }

  const command = async (id: string) =>
    (await admin.from('machine_commands').select('status, claim_token, lease_expires_at, completed_at, error_detail').eq('id', id).single()).data!

  const machineRow = async (id: string) =>
    (await admin.from('attendance_machines').select('id, archived_at, enabled, replaces_machine_id').eq('id', id).single()).data!

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
    school = await schools.create({ name: 'ZZ Machine Lifecycle Episodes School' })
    const prefix = randomBytes(8).toString('hex')
    const secret = randomBytes(32).toString('base64url')
    const a = await admin
      .from('attendance_agents')
      .insert({ school_id: school, install_id: randomUUID(), credential_prefix: prefix, credential_hash: sha256(secret), name: 'Lifecycle Test Agent' })
      .select('id')
      .single()
    if (a.error) throw new Error(a.error.message)
    agent = { id: a.data.id, credential: `agt_${prefix}_${secret}` }
    students = []
    for (const n of [1, 2, 3, 4]) {
      const { data, error } = await admin.from('students').insert({ school_id: school, full_name: `Lifecycle Student ${n}` }).select('id').single()
      if (error) throw new Error(error.message)
      students.push(data.id)
    }
  })

  afterAll(async () => {
    await schools.cleanup()
  })

  describe('archive', () => {
    let m: string
    let active: string
    let pending: string
    let removing: string
    let historic: string
    let historicBefore: Episode

    beforeAll(async () => {
      m = await makeMachine('LCE-ARCHIVE')
      historic = await addEpisode(m, { machine_user_id: nextUser(), student_id: students[3], linked_at: LONG_AGO, unlinked_at: '2026-09-02T00:00:00+00:00', sync_state: 'removed', desired_state: 'absent' })
      historicBefore = (await episodes(m)).find((e) => e.id === historic)!
      active = await addEpisode(m, { machine_user_id: nextUser(), student_id: students[0], linked_at: LONG_AGO, sync_state: 'synced' })
      pending = await addEpisode(m, { machine_user_id: nextUser(), student_id: students[1] })
      removing = await addEpisode(m, { machine_user_id: nextUser(), student_id: students[2], linked_at: LONG_AGO, sync_state: 'synced', desired_state: 'absent' })
    })

    it('closes active episodes at the archive time and cancels pending ones; history is untouched', async () => {
      expect((await admin.rpc('archive_attendance_machine', { machine_id: m })).error).toBeNull()
      const archivedAt = (await machineRow(m)).archived_at
      const byId = Object.fromEntries((await episodes(m)).map((e) => [e.id, e]))
      expect(byId[active]).toMatchObject({ linked_at: expect.any(String), unlinked_at: archivedAt, sync_state: 'synced', desired_state: 'present' })
      expect(byId[pending]).toMatchObject({ linked_at: null, unlinked_at: archivedAt, sync_state: 'cancelled' })
      expect(byId[removing]).toMatchObject({ unlinked_at: archivedAt, desired_state: 'absent' })
      expect(byId[historic]).toEqual(historicBefore)
      expect((await episodes(m)).filter((e) => e.unlinked_at === null)).toEqual([])
    })

    it('the archived machine is disabled (Archived state)', async () => {
      expect(await machineRow(m)).toMatchObject({ enabled: false, archived_at: expect.any(String) })
    })

    it('archiving again changes nothing', async () => {
      const before = await episodes(m)
      const at = (await machineRow(m)).archived_at
      expect((await admin.rpc('archive_attendance_machine', { machine_id: m })).error).toBeNull()
      expect(await episodes(m)).toEqual(before)
      expect((await machineRow(m)).archived_at).toBe(at)
    })
  })

  describe('commands on archive', () => {
    it('cancels pending, claimed and running commands at the archive instant; finished and Agent-wide ones are untouched; none can be claimed or completed after', async () => {
      const m = await makeMachine('LCE-COMMANDS')
      const other = await makeMachine('LCE-COMMANDS-OTHER')
      const done = await addCommand(m)
      const claimedBatch = (await anonClient().rpc('claim_machine_commands', { credential: agent.credential, max_commands: 100 })).data as { id: string; claim_token: string }[]
      const doneClaim = claimedBatch.find((c) => c.id === done)!
      await anonClient().rpc('complete_machine_command', { credential: agent.credential, command_id: done, claim_token: doneClaim.claim_token, status: 'succeeded' })
      const inFlight = await addCommand(m)
      const flight = ((await anonClient().rpc('claim_machine_commands', { credential: agent.credential, max_commands: 100 })).data as { id: string; claim_token: string }[]).find((c) => c.id === inFlight)!
      const running = await addCommand(m)
      const runClaim = ((await anonClient().rpc('claim_machine_commands', { credential: agent.credential, max_commands: 100 })).data as { id: string; claim_token: string }[]).find((c) => c.id === running)!
      await admin.from('machine_commands').update({ status: 'running' }).eq('id', running)
      const waiting = await addCommand(m)
      const agentWide = await addCommand(null, 'REFRESH_CONFIG')
      const elsewhere = await addCommand(other)

      expect((await admin.rpc('archive_attendance_machine', { machine_id: m })).error).toBeNull()

      const archivedAt = (await machineRow(m)).archived_at
      for (const id of [inFlight, running, waiting]) {
        expect(await command(id)).toMatchObject({ status: 'cancelled', claim_token: null, lease_expires_at: null, error_detail: 'machine archived', completed_at: archivedAt })
      }
      expect((await command(done)).status).toBe('succeeded')
      expect((await command(agentWide)).status).toBe('pending')
      expect((await command(elsewhere)).status).toBe('pending')

      const after = ((await anonClient().rpc('claim_machine_commands', { credential: agent.credential, max_commands: 100 })).data as { id: string }[]).map((c) => c.id)
      expect(after).not.toContain(waiting)
      expect(after).not.toContain(inFlight)
      expect((await anonClient().rpc('complete_machine_command', { credential: agent.credential, command_id: inFlight, claim_token: flight.claim_token, status: 'succeeded' })).data).toBe('stale')
      expect((await anonClient().rpc('complete_machine_command', { credential: agent.credential, command_id: running, claim_token: runClaim.claim_token, status: 'succeeded' })).data).toBe('stale')
    })
  })

  describe('restore', () => {
    it('keeps the machine row, leaves closed episodes closed, and gives everyone still desired a new pending episode', async () => {
      const m = await makeMachine('LCE-RESTORE')
      const uActive = nextUser()
      const uPending = nextUser()
      const uRemoving = nextUser()
      const uHistoric = nextUser()
      await addEpisode(m, { machine_user_id: uHistoric, student_id: students[3], linked_at: LONG_AGO, unlinked_at: '2026-09-02T00:00:00+00:00', sync_state: 'removed' })
      const active = await addEpisode(m, { machine_user_id: uActive, student_id: students[0], linked_at: LONG_AGO, sync_state: 'synced' })
      await addEpisode(m, { machine_user_id: uPending, student_id: students[1] })
      await addEpisode(m, { machine_user_id: uRemoving, student_id: students[2], linked_at: LONG_AGO, sync_state: 'synced', desired_state: 'absent' })
      await admin.rpc('archive_attendance_machine', { machine_id: m })
      const closed = await episodes(m)

      expect((await admin.rpc('restore_attendance_machine', { machine_id: m })).error).toBeNull()
      expect(await machineRow(m)).toMatchObject({ id: m, archived_at: null, enabled: true })

      const after = await episodes(m)
      // Every earlier episode is exactly as archive left it — nothing reopened.
      for (const e of closed) expect(after.find((x) => x.id === e.id)).toEqual(e)
      const fresh = after.filter((e) => !closed.some((c) => c.id === e.id))
      expect(fresh.map((e) => [e.machine_user_id, e.student_id, e.linked_at, e.unlinked_at, e.sync_state, e.desired_state]).sort()).toEqual(
        [
          [uActive, students[0], null, null, 'pending', 'present'],
          [uPending, students[1], null, null, 'pending', 'present'],
        ].sort(),
      )
      expect(fresh.find((e) => e.machine_user_id === uActive)!.id).not.toBe(active)
    })

    it('repeated archive/restore cycles never duplicate, reopen or overlap', async () => {
      const m = await makeMachine('LCE-CYCLE')
      const u = nextUser()
      await addEpisode(m, { machine_user_id: u, student_id: students[0], linked_at: LONG_AGO, sync_state: 'synced' })
      for (let i = 0; i < 3; i++) {
        expect((await admin.rpc('archive_attendance_machine', { machine_id: m })).error).toBeNull()
        expect((await admin.rpc('restore_attendance_machine', { machine_id: m })).error).toBeNull()
      }
      const all = await episodes(m)
      expect(all).toHaveLength(4) // the original + one new pending episode per restore
      expect(all.filter((e) => e.unlinked_at === null)).toHaveLength(1) // one open episode
      expect(all.filter((e) => e.linked_at !== null)).toHaveLength(1) // only the original ever linked
    })

    it('does not collide with an episode that is already open for the same device user', async () => {
      const m = await makeMachine('LCE-OPEN')
      const u = nextUser()
      await addEpisode(m, { machine_user_id: u, student_id: students[0], linked_at: LONG_AGO, sync_state: 'synced' })
      await admin.rpc('archive_attendance_machine', { machine_id: m })
      await addEpisode(m, { machine_user_id: u, student_id: students[1] }) // opened meanwhile (maintenance)
      expect((await admin.rpc('restore_attendance_machine', { machine_id: m })).error).toBeNull()
      const open = (await episodes(m)).filter((e) => e.machine_user_id === u && e.unlinked_at === null)
      expect(open).toHaveLength(1)
      expect(open[0].student_id).toBe(students[1])
    })
  })

  describe('replace', () => {
    it('new hardware is a new row with new pending episodes; the old row keeps its closed history', async () => {
      const old = await makeMachine('LCE-OLD')
      const uActive = nextUser()
      const uPending = nextUser()
      const uRemoving = nextUser()
      await addEpisode(old, { machine_user_id: uActive, student_id: students[0], linked_at: LONG_AGO, sync_state: 'synced' })
      await addEpisode(old, { machine_user_id: uPending, student_id: students[1] })
      await addEpisode(old, { machine_user_id: uRemoving, student_id: students[2], linked_at: LONG_AGO, sync_state: 'synced', desired_state: 'absent' })
      const cmd = await addCommand(old)

      const { data: newId, error } = await admin.rpc('replace_attendance_machine', { machine_id: old, new_serial_number: 'LCE-NEW' })
      expect(error).toBeNull()
      expect(newId).not.toBe(old)
      expect(await machineRow(newId as string)).toMatchObject({ replaces_machine_id: old, archived_at: null, enabled: true })
      expect(await machineRow(old)).toMatchObject({ archived_at: expect.any(String), enabled: false })

      const oldEps = await episodes(old)
      expect(oldEps.every((e) => e.unlinked_at !== null)).toBe(true)
      expect(oldEps.every((e) => e.machine_id === old)).toBe(true)
      const newEps = await episodes(newId as string)
      expect(newEps.map((e) => [e.machine_user_id, e.student_id, e.linked_at, e.sync_state]).sort()).toEqual(
        [
          [uActive, students[0], null, 'pending'],
          [uPending, students[1], null, 'pending'],
        ].sort(),
      )
      expect(await command(cmd)).toMatchObject({ status: 'cancelled', error_detail: 'machine replaced' })
    })

    it('replacing an already-archived machine uses who was desired when it was archived, without re-closing anything', async () => {
      const old = await makeMachine('LCE-OLD-ARCHIVED')
      const u = nextUser()
      await addEpisode(old, { machine_user_id: u, student_id: students[3], linked_at: LONG_AGO, sync_state: 'synced' })
      await admin.rpc('archive_attendance_machine', { machine_id: old })
      const before = await episodes(old)
      const { data: newId, error } = await admin.rpc('replace_attendance_machine', { machine_id: old, new_serial_number: 'LCE-NEW-2' })
      expect(error).toBeNull()
      expect(await episodes(old)).toEqual(before)
      expect((await episodes(newId as string)).map((e) => [e.machine_user_id, e.student_id, e.sync_state])).toEqual([[u, students[3], 'pending']])
    })

    it('a failed replacement changes nothing (one transaction)', async () => {
      const old = await makeMachine('LCE-ATOMIC')
      await addEpisode(old, { machine_user_id: nextUser(), student_id: students[0], linked_at: LONG_AGO, sync_state: 'synced' })
      const cmd = await addCommand(old)
      const r = await admin.rpc('replace_attendance_machine', { machine_id: old, new_serial_number: 'LCE-NEW' }) // serial already taken
      expect(r.error).not.toBeNull()
      expect(await machineRow(old)).toMatchObject({ archived_at: null, enabled: true })
      expect((await episodes(old)).filter((e) => e.unlinked_at === null)).toHaveLength(1)
      expect((await command(cmd)).status).toBe('pending')
    })

    it('old punches resolve to the old episodes; nothing on the new hardware resolves until a new episode links', async () => {
      const day = '2026-10-05'
      const old = await makeMachine('LCE-PUNCH-OLD')
      const u = nextUser()
      await addEpisode(old, { machine_user_id: u, student_id: students[2], linked_at: LONG_AGO, sync_state: 'synced' })
      const insertPunch = async (machine: string, tappedAt: string) => {
        const { data, error } = await admin
          .from('attendance_events')
          .insert({
            school_id: school, source: 'agent', agent_id: agent.id, machine_id: machine, machine_user_id: u,
            event_key: `k-${randomUUID()}`, tapped_at: tappedAt, device_local_time: tappedAt.slice(0, 19),
            device_time_zone: 'Asia/Dhaka', verify_mode: '3', punch_state: '0',
          })
          .select('id')
          .single()
        if (error) throw new Error(error.message)
        return data.id as string
      }
      const oldPunch = await insertPunch(old, `${day}T02:00:00+00:00`) // recorded while the old device was in service
      const { data: newId } = await admin.rpc('replace_attendance_machine', { machine_id: old, new_serial_number: 'LCE-PUNCH-NEW' })
      const newPunch = await insertPunch(newId as string, `${day}T03:00:00+00:00`) // new device, episode still pending

      await anonClient().rpc('reconcile_attendance', { job_secret: RECONCILE_SECRET, target_school: school, target_date: day })
      const rec = (await admin.from('attendance_records').select('entry_at, exit_at').eq('person_id', students[2]).eq('att_date', day).single()).data
      expect(rec).toEqual({ entry_at: `${day}T02:00:00+00:00`, exit_at: null })
      const proc = Object.fromEntries(
        ((await admin.from('attendance_events').select('id, processed').in('id', [oldPunch, newPunch])).data ?? []).map((e) => [e.id, e.processed]),
      )
      expect(proc).toEqual({ [oldPunch]: true, [newPunch]: false })
    })
  })

  it('an episode linked at or after "now" still closes exactly at archived_at, never later', async () => {
    const m = await makeMachine('LCE-SKEW')
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString() // linked an hour ahead (clock skew)
    const normal = await addEpisode(m, { machine_user_id: nextUser(), student_id: students[0], linked_at: LONG_AGO, sync_state: 'synced' })
    const skewed = await addEpisode(m, { machine_user_id: nextUser(), student_id: students[1], linked_at: future, sync_state: 'synced' })
    const pendingEp = await addEpisode(m, { machine_user_id: nextUser(), student_id: students[2] })
    expect((await admin.rpc('archive_attendance_machine', { machine_id: m })).error).toBeNull()
    const archivedAt = (await machineRow(m)).archived_at!
    expect(new Date(archivedAt).getTime()).toBeGreaterThan(new Date(future).getTime())
    const byId = Object.fromEntries((await episodes(m)).map((e) => [e.id, e]))
    for (const id of [normal, skewed, pendingEp]) expect(byId[id].unlinked_at).toBe(archivedAt) // one instant for all
    expect(new Date(byId[skewed].unlinked_at!).getTime()).toBeGreaterThan(new Date(byId[skewed].linked_at!).getTime())
  })

  it('the lifecycle helpers are not callable by client roles', async () => {
    for (const [fn, args] of [
      ['_close_machine_episodes', { target_machine: randomUUID(), closed_at: new Date().toISOString() }],
      ['_cancel_machine_commands', { target_machine: randomUUID(), reason: 'x', cancelled_at: new Date().toISOString() }],
      ['_machine_archive_instant', { target_machine: randomUUID() }],
      ['_recreate_desired_episodes', { source_machine: randomUUID(), target_machine: randomUUID(), archived_since: new Date().toISOString() }],
    ] as const) {
      expect((await admin.rpc(fn, args)).error, fn).not.toBeNull()
      expect((await anonClient().rpc(fn, args)).error, fn).not.toBeNull()
    }
  })
})
