import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: seat plan v2 (issue #95, map #91, migration 0059) — multi-exam,
// multi-building generation with mixed seating, and the shipped guarantees
// that must survive it: same-school tenancy, room-wide capacity, Closed-exam
// immutability, and publish's overlap check (now within an exam, not across
// exams sharing a room).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

function anonClient() {
  return createClient(URL, ANON, { auth: { persistSession: false } })
}

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

const P = 'SP2 '

describe('Seat plan v2 (issue #95)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let classAId: string
  let classBId: string
  let examAId: string
  let examBId: string
  let roomOneId: string
  let roomTwoId: string
  let foreignRoomId: string

  // A Closed exam is undeletable by school roles (issue #8, preserved
  // behaviour), and it pins its class through the FK — so cleanup removes what
  // it can and the fixtures below reuse whatever survives, keeping the suite
  // re-runnable rather than green only on a virgin database.
  async function cleanup(client: SupabaseClient) {
    await client.from('exams').delete().like('name', `${P}%`).eq('status', 'open')
    await client.from('students').delete().like('full_name', `${P}%`)
    await client.from('rooms').delete().like('name', `${P}%`)
    await client.from('buildings').delete().like('name', `${P}%`)
    await client.from('classes').delete().like('name', `${P}%`)
  }

  /** Insert if absent, reuse if a previous run left it behind. */
  async function ensureClass(client: SupabaseClient, name: string): Promise<string> {
    const { data: existing } = await client
      .from('classes')
      .select('id')
      .eq('name', name)
      .maybeSingle()
    if (existing) return existing.id
    const { data, error } = await client
      .from('classes')
      .insert({ name, section: 'A' })
      .select('id')
      .single()
    if (error) throw new Error(`fixture class ${name}: ${error.message}`)
    return data!.id
  }

  beforeAll(async () => {
    ;[ownerA, ownerB] = await Promise.all([
      signedIn('owner-a@test.local'),
      signedIn('owner-b@test.local'),
    ])
    await cleanup(ownerA)
    await cleanup(ownerB)

    // Two buildings, one room each — the multi-building selection the doc asks
    // for, and enough to see exams interleave.
    const { data: buildings } = await ownerA
      .from('buildings')
      .insert([{ name: `${P}Block A` }, { name: `${P}Block B` }])
      .select('id, name')
    const blockA = buildings!.find((b) => b.name === `${P}Block A`)!.id
    const blockB = buildings!.find((b) => b.name === `${P}Block B`)!.id

    roomOneId = (
      await ownerA
        .from('rooms')
        .insert({ building_id: blockA, name: `${P}Room 101`, capacity: 4 })
        .select('id')
        .single()
    ).data!.id
    roomTwoId = (
      await ownerA
        .from('rooms')
        .insert({ building_id: blockB, name: `${P}Room 201`, capacity: 10 })
        .select('id')
        .single()
    ).data!.id

    const { data: foreignBuilding } = await ownerB
      .from('buildings')
      .insert({ name: `${P}Foreign Block` })
      .select('id')
      .single()
    foreignRoomId = (
      await ownerB
        .from('rooms')
        .insert({ building_id: foreignBuilding!.id, name: `${P}Foreign Room`, capacity: 50 })
        .select('id')
        .single()
    ).data!.id

    classAId = await ensureClass(ownerA, `${P}Class Six`)
    classBId = await ensureClass(ownerA, `${P}Class Seven`)

    await ownerA.from('students').insert([
      ...[1, 2, 3, 4].map((n) => ({
        full_name: `${P}Six Student ${n}`,
        class_name: `${P}Class Six`,
        section: 'A',
        roll_number: n,
      })),
      ...[1, 2, 3, 4].map((n) => ({
        full_name: `${P}Seven Student ${n}`,
        class_name: `${P}Class Seven`,
        section: 'A',
        roll_number: 100 + n,
      })),
    ])

    const { data: exams } = await ownerA
      .from('exams')
      .insert([
        { name: `${P}Exam Six`, exam_year: 2026, class_id: classAId },
        { name: `${P}Exam Seven`, exam_year: 2026, class_id: classBId },
      ])
      .select('id, name')
    examAId = exams!.find((e) => e.name === `${P}Exam Six`)!.id
    examBId = exams!.find((e) => e.name === `${P}Exam Seven`)!.id
  })

  afterAll(async () => {
    await cleanup(ownerA)
    await cleanup(ownerB)
  })

  it('seats two exams in the same room — mixed seating', async () => {
    const { error } = await ownerA.rpc('generate_seat_plan_for', {
      exam_ids: [examAId, examBId],
      room_ids: [roomOneId, roomTwoId],
    })
    expect(error).toBeNull()

    const { data: rows } = await ownerA
      .from('exam_seat_plans')
      .select('exam_id, room_id, roll_start, roll_end')
      .in('exam_id', [examAId, examBId])
    expect(rows!.length).toBeGreaterThan(0)

    const examsInRoomOne = new Set(rows!.filter((r) => r.room_id === roomOneId).map((r) => r.exam_id))
    expect(examsInRoomOne.size).toBe(2)
  })

  it('places every student of both exams exactly once', async () => {
    const { data: rows } = await ownerA
      .from('exam_seat_plans')
      .select('exam_id, roll_start, roll_end')
      .in('exam_id', [examAId, examBId])

    const seated = (examId: string) =>
      rows!
        .filter((r) => r.exam_id === examId)
        .reduce((n, r) => n + (r.roll_end - r.roll_start + 1), 0)
    expect(seated(examAId)).toBe(4)
    expect(seated(examBId)).toBe(4)
  })

  it('never exceeds a room capacity once every exam in the room is summed', async () => {
    const { data: rows } = await ownerA
      .from('exam_seat_plans')
      .select('room_id, roll_start, roll_end')
      .in('room_id', [roomOneId, roomTwoId])
    const used = new Map<string, number>()
    for (const r of rows!) {
      used.set(r.room_id, (used.get(r.room_id) ?? 0) + (r.roll_end - r.roll_start + 1))
    }
    expect(used.get(roomOneId) ?? 0).toBeLessThanOrEqual(4)
    expect(used.get(roomTwoId) ?? 0).toBeLessThanOrEqual(10)
  })

  it('the capacity trigger rejects an allocation that only overflows once other exams count', async () => {
    // Room One is capacity 4 and already full from the generation above.
    const { error } = await ownerA.from('exam_seat_plans').insert({
      exam_id: examAId,
      room_id: roomOneId,
      roll_start: 900,
      roll_end: 900,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('capacity')
  })

  it('regenerating one exam leaves the other exam seated in the same rooms', async () => {
    const { error } = await ownerA.rpc('generate_seat_plan_for', {
      exam_ids: [examAId],
      room_ids: [roomTwoId],
    })
    expect(error).toBeNull()

    const { data: other } = await ownerA
      .from('exam_seat_plans')
      .select('id')
      .eq('exam_id', examBId)
    expect(other!.length).toBeGreaterThan(0)
  })

  it("rejects another school's room", async () => {
    const { error } = await ownerA.rpc('generate_seat_plan_for', {
      exam_ids: [examAId],
      room_ids: [foreignRoomId],
    })
    // The room is filtered out by school scope, so nothing is placed rather
    // than a foreign room being written into.
    expect(error).toBeNull()
    const { data: rows } = await ownerA
      .from('exam_seat_plans')
      .select('room_id')
      .eq('exam_id', examAId)
    expect(rows!.every((r) => r.room_id !== foreignRoomId)).toBe(true)
  })

  it("rejects another school's exam", async () => {
    const { data: foreignExam } = await ownerB
      .from('exams')
      .insert({ name: `${P}Foreign Exam`, exam_year: 2026 })
      .select('id')
      .single()
    const { error } = await ownerA.rpc('generate_seat_plan_for', {
      exam_ids: [foreignExam!.id],
      room_ids: [roomOneId],
    })
    expect(error).not.toBeNull()
  })

  it('refuses to generate for a Closed exam', async () => {
    const { data: closed } = await ownerA
      .from('exams')
      .insert({ name: `${P}Closed Exam ${Date.now()}`, exam_year: 2026, class_id: classAId })
      .select('id')
      .single()
    await ownerA.rpc('close_exam', { exam: closed!.id })

    const { error } = await ownerA.rpc('generate_seat_plan_for', {
      exam_ids: [closed!.id],
      room_ids: [roomOneId],
    })
    expect(error).not.toBeNull()
  })

  it('publish detects an overlap within one exam, not across exams sharing a room', async () => {
    await ownerA.rpc('generate_seat_plan_for', {
      exam_ids: [examAId, examBId],
      room_ids: [roomOneId, roomTwoId],
    })

    // Two exams overlapping numerically in the same room is legitimate mixed
    // seating, not a conflict — publish must accept it.
    const { error: publishOk } = await ownerA.rpc('publish_seat_plan', { exam: examAId })
    expect(publishOk).toBeNull()

    // The same exam claiming an overlapping range twice is a real conflict.
    const { data: mine } = await ownerA
      .from('exam_seat_plans')
      .select('roll_start, roll_end')
      .eq('exam_id', examAId)
      .order('roll_start')
      .limit(1)
    await ownerA.from('exam_seat_plans').insert({
      exam_id: examAId,
      room_id: roomTwoId,
      roll_start: mine![0].roll_start,
      roll_end: mine![0].roll_end,
    })
    const { error: publishClash } = await ownerA.rpc('publish_seat_plan', { exam: examAId })
    expect(publishClash).not.toBeNull()
  })

  it('any seat-plan write clears the publish marker (0045 preserved)', async () => {
    await ownerA.rpc('generate_seat_plan_for', { exam_ids: [examBId], room_ids: [roomTwoId] })
    await ownerA.rpc('publish_seat_plan', { exam: examBId })

    await ownerA.rpc('generate_seat_plan_for', { exam_ids: [examBId], room_ids: [roomTwoId] })
    const { data: exam } = await ownerA
      .from('exams')
      .select('seat_plan_published_at')
      .eq('id', examBId)
      .single()
    expect(exam?.seat_plan_published_at).toBeNull()
  })

  // Regression (code review, 2026-07-23): the generator budgeted from raw room
  // capacity while deliberately not deleting other exams' rows, so a room
  // already partly occupied by a non-selected exam overfilled and the capacity
  // trigger aborted the entire run.
  it('budgets around an exam it was not asked to regenerate', async () => {
    // Seat Exam Seven alone in Room One (capacity 4), then regenerate only
    // Exam Six into the same room.
    await ownerA.rpc('generate_seat_plan_for', { exam_ids: [examBId], room_ids: [roomOneId] })
    const { data: before } = await ownerA
      .from('exam_seat_plans')
      .select('roll_start, roll_end')
      .eq('exam_id', examBId)
      .eq('room_id', roomOneId)
    expect(before!.length).toBeGreaterThan(0)

    const { error } = await ownerA.rpc('generate_seat_plan_for', {
      exam_ids: [examAId],
      room_ids: [roomOneId, roomTwoId],
    })
    expect(error).toBeNull()

    // The other exam kept its seats, and the room is still within capacity.
    const { data: rows } = await ownerA
      .from('exam_seat_plans')
      .select('exam_id, roll_start, roll_end')
      .eq('room_id', roomOneId)
    const used = rows!.reduce((n, r) => n + (r.roll_end - r.roll_start + 1), 0)
    expect(used).toBeLessThanOrEqual(4)
    expect(rows!.some((r) => r.exam_id === examBId)).toBe(true)
  })

  it('the single-exam signature still works for shipped callers', async () => {
    const { error } = await ownerA.rpc('generate_seat_plan', { exam: examAId })
    expect(error).toBeNull()
    const { data: rows } = await ownerA.from('exam_seat_plans').select('id').eq('exam_id', examAId)
    expect(rows!.length).toBeGreaterThan(0)
  })
})
