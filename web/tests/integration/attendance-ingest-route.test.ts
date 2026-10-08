import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { POST } from '@/app/api/attendance/ingest/[schoolId]/route'
import { signedIn, anonClient } from '../helpers/auth'
import { enrollCard } from '../helpers/machine-enroll'

// Seam: the device-facing HTTP handler itself (issue #674), called with the
// same request shape an attendance device or Windows sync service sends —
// JSON body, x-ingest-token header, no cookies or session — then reconciled
// through machine_enroll_infos. rfid-attendance.test.ts covers the RPCs; this
// covers what the route adds on top: auth, validation and error responses.

const RECONCILE_SECRET = process.env.RECONCILE_SECRET ?? 'test-reconcile-secret'
const DAY = '2025-11-30'
const STU_CARD = 'ROUTE-STU-1'
const EMP_CARD = 'ROUTE-EMP-1'
const UNKNOWN_CARD = 'ROUTE-UNKNOWN-1'
const CARDS = [STU_CARD, EMP_CARD, UNKNOWN_CARD]

function ingest(schoolId: string, body: unknown, token?: string | null, raw = false) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers['x-ingest-token'] = token
  const request = new Request(`http://localhost/api/attendance/ingest/${schoolId}`, {
    method: 'POST',
    headers,
    body: raw ? (body as string) : JSON.stringify(body),
  })
  return POST(request, { params: Promise.resolve({ schoolId }) })
}

// Reconcile DAY for one School the way the cron route now does (migration 0215):
// mark the (School, day) pair due, then drain the queue for that School.
const reconcile = async (school: string) => {
  await anonClient().rpc('enqueue_attendance_reconcile_dates', { job_secret: RECONCILE_SECRET, target_date: DAY, target_school: school })
  return anonClient().rpc('drain_attendance_reconcile_queue', { job_secret: RECONCILE_SECRET, only_school: school })
}

describe('POST /api/attendance/ingest/[schoolId] (#674)', () => {
  let ownerA: SupabaseClient
  let schoolA: string
  let tokenA: string
  let tokenB: string
  let studentId: string
  let employeeId: string
  let originalEnabled: boolean

  async function clean() {
    await ownerA.from('attendance_events').delete().in('card_number', CARDS)
    await ownerA.from('attendance_records').delete().eq('att_date', DAY)
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    const ownerB = await signedIn('owner-b@test.local')
    const school = async (owner: SupabaseClient) => {
      const uid = (await owner.auth.getUser()).data.user!.id
      const { data: p } = await owner.from('profiles').select('school_id').eq('id', uid).single()
      const { data: s } = await owner
        .from('schools')
        .select('id, ingest_token, automatic_attendance_enabled')
        .eq('id', p!.school_id)
        .single()
      return s!
    }
    const a = await school(ownerA)
    schoolA = a.id
    tokenA = a.ingest_token
    originalEnabled = a.automatic_attendance_enabled
    tokenB = (await school(ownerB)).ingest_token
    if (!originalEnabled) await ownerA.rpc('set_automatic_attendance_enabled', { enabled: true })

    await ownerA.from('students').delete().eq('full_name', 'Ingest Route Student')
    await ownerA.from('employees').delete().eq('full_name', 'Ingest Route Employee')
    await clean()
    studentId = (await ownerA.from('students').insert({ full_name: 'Ingest Route Student' }).select('id').single()).data!.id
    employeeId = (await ownerA.from('employees').insert({ full_name: 'Ingest Route Employee' }).select('id').single()).data!.id
    await enrollCard(ownerA, { student_id: studentId }, STU_CARD)
    await enrollCard(ownerA, { employee_id: employeeId }, EMP_CARD)
  })

  afterAll(async () => {
    await clean()
    await ownerA.from('students').delete().eq('id', studentId)
    await ownerA.from('employees').delete().eq('id', employeeId)
    if (!originalEnabled) await ownerA.rpc('set_automatic_attendance_enabled', { enabled: false })
  })

  describe('authentication', () => {
    it('rejects a request with no x-ingest-token header', async () => {
      const res = await ingest(schoolA, { card_number: STU_CARD, tapped_at: `${DAY}T08:00:00Z` }, null)
      expect(res.status).toBe(401)
    })

    it('rejects a wrong token', async () => {
      const res = await ingest(schoolA, { card_number: STU_CARD, tapped_at: `${DAY}T08:00:00Z` }, crypto.randomUUID())
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe('invalid ingest token')
    })

    it("rejects another school's token for this school", async () => {
      const res = await ingest(schoolA, { card_number: STU_CARD, tapped_at: `${DAY}T08:00:00Z` }, tokenB)
      expect(res.status).toBe(401)
    })

    it('rejects a malformed school id or token without leaking the database error', async () => {
      for (const [school, token] of [
        ['not-a-uuid', tokenA],
        [schoolA, 'not-a-uuid'],
      ]) {
        const res = await ingest(school, { card_number: STU_CARD, tapped_at: `${DAY}T08:00:00Z` }, token)
        expect(res.status).toBe(401)
        expect(JSON.stringify(await res.json())).not.toMatch(/uuid|syntax/i)
      }
    })
  })

  describe('payload validation', () => {
    it('rejects a body that is not JSON', async () => {
      const res = await ingest(schoolA, 'card=1', tokenA, true)
      expect(res.status).toBe(400)
    })

    it('rejects an empty batch', async () => {
      const res = await ingest(schoolA, { events: [] }, tokenA)
      expect(res.status).toBe(400)
    })

    it('skips events with no card number or an unparseable time', async () => {
      const res = await ingest(
        schoolA,
        { events: [{ card_number: '', tapped_at: `${DAY}T08:00:00Z` }, { card_number: STU_CARD, tapped_at: 'nope' }] },
        tokenA,
      )
      expect(res.status).toBe(200)
      expect((await res.json()).ingested).toBe(0)
    })
  })

  describe('ingest → reconcile through machine_enroll_infos', () => {
    it('accepts a single device push and a batch', async () => {
      const single = await ingest(schoolA, { card_number: STU_CARD, tapped_at: `${DAY}T08:00:00Z` }, tokenA)
      expect(single.status).toBe(200)
      expect((await single.json()).ingested).toBe(1)

      const batch = await ingest(
        schoolA,
        {
          events: [
            { card_number: STU_CARD, tapped_at: `${DAY}T08:00:00Z` }, // duplicate of the single push
            { card_number: STU_CARD, tapped_at: `${DAY}T13:00:00Z` },
            { card_number: EMP_CARD, tapped_at: `${DAY}T08:10:00Z` },
            { card_number: EMP_CARD, tapped_at: `${DAY}T16:00:00Z` },
            { card_number: UNKNOWN_CARD, tapped_at: `${DAY}T09:00:00Z` },
          ],
        },
        tokenA,
      )
      expect(batch.status).toBe(200)
      expect((await batch.json()).ingested).toBe(5)
    })

    it('resolves the student and the employee to the right person, collapsing duplicate taps', async () => {
      expect((await reconcile(schoolA)).error).toBeNull()
      const { data } = await ownerA
        .from('attendance_records')
        .select('person_type, person_id, entry_at, exit_at')
        .eq('att_date', DAY)
        .in('person_id', [studentId, employeeId])
      expect(data).toHaveLength(2)
      const stu = data!.find((r) => r.person_id === studentId)!
      const emp = data!.find((r) => r.person_id === employeeId)!
      expect(stu.person_type).toBe('student')
      expect(stu.entry_at).toBe(`${DAY}T08:00:00+00:00`)
      expect(stu.exit_at).toBe(`${DAY}T13:00:00+00:00`)
      expect(emp.person_type).toBe('employee')
      expect(emp.entry_at).toBe(`${DAY}T08:10:00+00:00`)
      expect(emp.exit_at).toBe(`${DAY}T16:00:00+00:00`)
    })

    it('leaves an unknown card unprocessed and unattributed', async () => {
      const { data } = await ownerA.from('attendance_events').select('processed').eq('card_number', UNKNOWN_CARD)
      expect(data!.length).toBeGreaterThan(0)
      expect(data!.every((e) => e.processed === false)).toBe(true)
    })

    it('re-running reconciliation keeps exactly one record per person', async () => {
      expect((await reconcile(schoolA)).error).toBeNull()
      const { data } = await ownerA
        .from('attendance_records')
        .select('person_id')
        .eq('att_date', DAY)
        .in('person_id', [studentId, employeeId])
      expect(data).toHaveLength(2)
    })
  })
})
