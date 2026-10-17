import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, anonClient } from '../helpers/auth'
import { ensureStaffLogin } from '../helpers/staff'
import { deleteMachine, restoreMachine } from '@/lib/machine-enrollment-store'

// Machine Attendance Phase 3 slice 3B (migration 0217, ADR 0033):
// attendance_machines gains the Attendance Agent's connection and device
// fields, a serial lock, and the archive / restore / replace lifecycle.

const SERIAL = (n: string) => `MLC-TEST-${n}`
const FIXTURE_AGENT_A = '0216a9e7-0000-4000-8000-00000000000a' // the 3A suite's fixture Agents
const FIXTURE_AGENT_B = '0216a9e7-0000-4000-8000-00000000000b'

describe('attendance machine lifecycle (Machine Attendance Phase 3, slice 3B)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let grantStaff: SupabaseClient
  let noGrantStaff: SupabaseClient
  let admin: SupabaseClient
  let ownerAId: string

  const base = (n: string) => ({
    machine_type: 'timmy',
    model: 'TM52GPRS',
    serial_number: SERIAL(n),
    location: 'Lifecycle Test Gate',
    shift_scope: 'none',
  })

  const create = async (n: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await ownerA.from('attendance_machines').insert({ ...base(n), ...extra }).select('id').single()
    if (error) throw new Error(error.message)
    return data.id as string
  }

  const machine = async (client: SupabaseClient, id: string) =>
    (await client.from('attendance_machines').select('*').eq('id', id).maybeSingle()).data

  const cleanup = async () => {
    // Replacements reference what they replaced: delete newest first.
    const { data } = await admin
      .from('attendance_machines')
      .select('id, replaces_machine_id')
      .like('serial_number', 'MLC-TEST-%')
      .order('created_at', { ascending: false })
    for (const m of data ?? []) await admin.from('attendance_machines').delete().eq('id', m.id)
  }

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    ownerAId = (await ownerA.auth.getUser()).data.user!.id
    await ensureStaffLogin(ownerA, { email: 'ma675-grant@test.local', fullName: 'MA675 Attendance Staff', screens: ['attendance'] })
    await ensureStaffLogin(ownerA, { email: 'ma675-nogrant@test.local', fullName: 'MA675 No Grant Staff' })
    grantStaff = await signedIn('ma675-grant@test.local')
    noGrantStaff = await signedIn('ma675-nogrant@test.local')
    await cleanup()
  })

  afterAll(cleanup)

  describe('new columns', () => {
    it('a new machine starts with sensible defaults and its School\'s time zone', async () => {
      const id = await create('defaults')
      expect(await machine(ownerA, id)).toMatchObject({
        time_zone: 'Asia/Dhaka',
        driver_key: 'auto',
        port: 4370,
        host: null,
        enabled: true,
        agent_id: null,
        capabilities: {},
        credential_configured: false,
        probed_serial: null,
        archived_at: null,
        replaces_machine_id: null,
      })
    })

    it('the School sets the connection details it owns', async () => {
      const id = await create('config')
      const { error } = await ownerA
        .from('attendance_machines')
        .update({ host: '192.168.0.201', port: 5005, driver_key: 'timmy-sdk-fpclock', enabled: false })
        .eq('id', id)
      expect(error).toBeNull()
      expect(await machine(ownerA, id)).toMatchObject({ host: '192.168.0.201', port: 5005, driver_key: 'timmy-sdk-fpclock', enabled: false })
    })

    it('refuses an invalid port, host, driver key or time zone', async () => {
      const id = await create('invalid')
      for (const bad of [{ port: 0 }, { port: 70000 }, { host: '192.168.0.1 x' }, { driver_key: 'Bad Key' }, { time_zone: '+06' }, { time_zone: 'Mars/Base' }]) {
        expect((await ownerA.from('attendance_machines').update(bad).eq('id', id)).error, JSON.stringify(bad)).not.toBeNull()
      }
    })

    it("a machine can be assigned only its own School's Attendance Agent", async () => {
      const id = await create('agent')
      const { data: agents } = await admin
        .from('attendance_agents_safe')
        .select('id, install_id')
        .in('install_id', [FIXTURE_AGENT_A, FIXTURE_AGENT_B])
      const agentA = agents?.find((a) => a.install_id === FIXTURE_AGENT_A)
      const agentB = agents?.find((a) => a.install_id === FIXTURE_AGENT_B)
      if (!agentA || !agentB) return expect.unreachable('run attendance-agents-schema first: its fixture Agents are missing')
      expect((await ownerA.from('attendance_machines').update({ agent_id: agentB.id }).eq('id', id)).error).not.toBeNull()
      expect((await ownerA.from('attendance_machines').update({ agent_id: agentA.id }).eq('id', id)).error).toBeNull()
      await ownerA.from('attendance_machines').update({ agent_id: null }).eq('id', id)
    })
  })

  describe('Agent-reported and lifecycle columns are not School-editable', () => {
    it('a School user cannot write device facts, the serial lock or the archive state', async () => {
      const id = await create('agentcols')
      for (const field of [
        { firmware_version: 'Ver 6.60' },
        { capabilities: { canReadUsers: true } },
        { credential_configured: true },
        { probed_serial: SERIAL('agentcols'), serial_verified_at: new Date().toISOString() },
        { archived_at: new Date().toISOString() },
      ]) {
        expect((await ownerA.from('attendance_machines').update(field).eq('id', id)).error, JSON.stringify(field)).not.toBeNull()
      }
      const insert = await ownerA.from('attendance_machines').insert({ ...base('agentcols-insert'), firmware_version: 'x' })
      expect(insert.error).not.toBeNull()
    })
  })

  describe('serial lock', () => {
    it('once the device has confirmed its serial, the serial cannot change', async () => {
      const id = await create('lock')
      // Super Admin stands in for the Phase 6 probe-report function.
      const lock = await admin
        .from('attendance_machines')
        .update({ probed_serial: SERIAL('lock'), serial_verified_at: new Date().toISOString() })
        .eq('id', id)
      expect(lock.error).toBeNull()
      expect((await admin.from('attendance_machines').update({ probed_serial: 'OTHER' }).eq('id', id)).error).not.toBeNull()
      expect((await ownerA.from('attendance_machines').update({ serial_number: SERIAL('lock-2') }).eq('id', id)).error).not.toBeNull()
      // Everything else stays editable.
      expect((await ownerA.from('attendance_machines').update({ location: 'Moved Gate' }).eq('id', id)).error).toBeNull()
    })
  })

  describe('archive and restore', () => {
    it('archives a machine and records who did it; the machine stays', async () => {
      const id = await create('archive')
      expect((await ownerA.rpc('archive_attendance_machine', { machine_id: id })).error).toBeNull()
      const m = await machine(ownerA, id)
      expect(m!.archived_at).not.toBeNull()
      expect(m!.archived_by).toBe(ownerAId)
      // Archiving again is harmless.
      expect((await ownerA.rpc('archive_attendance_machine', { machine_id: id })).error).toBeNull()
    })

    it('an archived machine is frozen until restored', async () => {
      const id = await create('frozen')
      await ownerA.rpc('archive_attendance_machine', { machine_id: id })
      expect((await ownerA.from('attendance_machines').update({ location: 'Elsewhere' }).eq('id', id)).error?.message).toMatch(/restore it first/)
      expect((await restoreMachine(ownerA, id)).error).toBeUndefined()
      expect((await machine(ownerA, id))!.archived_at).toBeNull()
      expect((await ownerA.from('attendance_machines').update({ location: 'Elsewhere' }).eq('id', id)).error).toBeNull()
    })

    it('follows the Attendance grant and the School boundary', async () => {
      const id = await create('reach')
      expect((await noGrantStaff.rpc('archive_attendance_machine', { machine_id: id })).error).not.toBeNull()
      expect((await ownerB.rpc('archive_attendance_machine', { machine_id: id })).error).not.toBeNull()
      expect((await anonClient().rpc('archive_attendance_machine', { machine_id: id })).error).not.toBeNull()
      expect((await machine(ownerA, id))!.archived_at).toBeNull()
      expect((await grantStaff.rpc('archive_attendance_machine', { machine_id: id })).error).toBeNull()
      expect((await grantStaff.rpc('restore_attendance_machine', { machine_id: id })).error).toBeNull()
    })
  })

  describe('replace', () => {
    let oldId: string
    let newId: string

    it('creates a new machine for the new hardware and archives the old one', async () => {
      oldId = await create('old', { host: '192.168.0.201', port: 5005, note: 'Main entrance' })
      const { data, error } = await ownerA.rpc('replace_attendance_machine', {
        machine_id: oldId,
        new_serial_number: SERIAL('new'),
        new_model: 'TM52GPRS-2',
      })
      expect(error).toBeNull()
      newId = data as string
      expect(newId).not.toBe(oldId)
      expect(await machine(ownerA, newId)).toMatchObject({
        serial_number: SERIAL('new'),
        model: 'TM52GPRS-2',
        location: 'Lifecycle Test Gate',
        host: '192.168.0.201',
        port: 5005,
        note: 'Main entrance',
        replaces_machine_id: oldId,
        archived_at: null,
        probed_serial: null,
      })
      expect((await machine(ownerA, oldId))!.archived_at).not.toBeNull()
    })

    it('the replaced machine can be neither restored, replaced again, nor deleted', async () => {
      expect(await restoreMachine(ownerA, oldId)).toEqual({ error: 'errMachineReplaced' })
      expect((await ownerA.rpc('replace_attendance_machine', { machine_id: oldId, new_serial_number: SERIAL('newer') })).error).not.toBeNull()
      expect(await deleteMachine(ownerA, oldId)).toEqual({ error: 'errMachineInUse' })
      expect(await machine(ownerA, oldId)).not.toBeNull()
    })

    it('replacement hardware must have its own serial number', async () => {
      const id = await create('dup-src')
      expect((await ownerA.rpc('replace_attendance_machine', { machine_id: id, new_serial_number: SERIAL('new') })).error).not.toBeNull()
      expect((await machine(ownerA, id))!.archived_at).toBeNull() // nothing happened
    })
  })

  it('a never-used machine can still be deleted', async () => {
    const id = await create('unused')
    expect(await deleteMachine(ownerA, id)).toEqual({})
    expect(await machine(ownerA, id)).toBeNull()
  })
})
