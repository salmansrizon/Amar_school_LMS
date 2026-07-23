import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, anonClient } from '../helpers/auth'

// SMS Compose + Log (issue #36, PRD §5.7). Manual composes insert into the
// same sms_log table the absence-rule cron writes to (0021), distinguished
// by `kind`/`batch_id`/`recipient_label`/`segments` (0047). This proves:
//  - a manual compose insert (real session, no job secret) is scoped by RLS
//  - record_absence_sms's new batch/segment params + returned id work
//  - set_sms_log_status flips a row to 'failed' after a real send attempt
const SECRET = process.env.RECONCILE_SECRET!


describe('SMS Compose + Log (issue #36)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let schoolIdA: string
  let studentId: string
  let rule: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    const {
      data: { user },
    } = await ownerA.auth.getUser()
    schoolIdA = (await ownerA.from('profiles').select('school_id').eq('id', user!.id).single()).data!.school_id

    // Explicit school_id predicates even though RLS already scopes these —
    // this project's Postgres is a shared dev instance other agents use
    // concurrently, so don't rely solely on RLS as the only thing standing
    // between a test and a mass delete.
    await ownerA.from('students').delete().eq('full_name', 'Compose Test Student')
    await ownerA.from('sms_log').delete().eq('school_id', schoolIdA)
    await ownerA.from('absence_sms_rules').delete().eq('school_id', schoolIdA)

    studentId = (
      await ownerA
        .from('students')
        .insert({ full_name: 'Compose Test Student', class_name: 'Class 6', section: 'A', guardian_phone: '01700000001' })
        .select('id')
        .single()
    ).data!.id

    rule = (await ownerA.from('absence_sms_rules').insert({ exact_days: 1 }).select('id').single()).data!.id
  })

  afterAll(async () => {
    await ownerA.from('sms_log').delete().eq('school_id', schoolIdA)
    await ownerA.from('absence_sms_rules').delete().eq('id', rule)
    await ownerA.from('students').delete().eq('id', studentId)
  })

  it('a manual compose insert lands with kind=manual and a shared batch_id, scoped to the caller\'s School', async () => {
    const batchId = crypto.randomUUID()
    const sentOn = new Date().toISOString().slice(0, 10)
    const rows = [
      { school_id: schoolIdA, student_id: studentId, sent_on: sentOn, phone: '01700000001', body: 'hello', provider: 'log', kind: 'manual', batch_id: batchId, recipient_label: 'Class 6 / A', segments: 1, status: 'sent' },
      { school_id: schoolIdA, student_id: null, sent_on: sentOn, phone: '01700000002', body: 'hello', provider: 'log', kind: 'manual', batch_id: batchId, recipient_label: 'Class 6 / A', segments: 1, status: 'sent' },
    ]
    const { error } = await ownerA.from('sms_log').insert(rows)
    expect(error).toBeNull()

    const { data: seenByA } = await ownerA.from('sms_log').select('id').eq('batch_id', batchId)
    expect(seenByA).toHaveLength(2)

    const { data: seenByB } = await ownerB.from('sms_log').select('id').eq('batch_id', batchId)
    expect(seenByB).toEqual([])
  })

  it('a manual insert cannot claim another School\'s school_id (RLS insert check)', async () => {
    const { data: { user: userB } } = await ownerB.auth.getUser()
    const schoolIdB = (await ownerB.from('profiles').select('school_id').eq('id', userB!.id).single()).data!.school_id
    const { error } = await ownerB
      .from('sms_log')
      .insert({
        school_id: schoolIdA,
        sent_on: new Date().toISOString().slice(0, 10),
        phone: '01700000009',
        body: 'x',
        provider: 'log',
        kind: 'manual',
        segments: 1,
      })
    expect(error).not.toBeNull()
    // sanity: B really does have a different school id than A
    expect(schoolIdB).not.toBe(schoolIdA)
  })

  it('record_absence_sms accepts a batch id + segment count and returns the new row id', async () => {
    const batchId = crypto.randomUUID()
    const { data: logId, error } = await anonClient().rpc('record_absence_sms', {
      job_secret: SECRET,
      p_school: schoolIdA,
      p_student: studentId,
      p_rule: rule,
      p_sent_on: '2026-06-01',
      p_phone: '01700000001',
      p_body: 'absent 1 working day',
      p_provider: 'log',
      p_batch: batchId,
      p_segments: 1,
    })
    expect(error).toBeNull()
    expect(logId).toBeTruthy()

    const { data: row } = await ownerA.from('sms_log').select('kind, batch_id, segments, status').eq('id', logId).single()
    expect(row).toMatchObject({ kind: 'absence_auto', batch_id: batchId, segments: 1, status: 'sent' })
  })

  it('a repeat call for the same student/rule/day is deduped (returns null, no new row)', async () => {
    const { data: logId } = await anonClient().rpc('record_absence_sms', {
      job_secret: SECRET,
      p_school: schoolIdA,
      p_student: studentId,
      p_rule: rule,
      p_sent_on: '2026-06-01',
      p_phone: '01700000001',
      p_body: 'absent 1 working day',
      p_provider: 'log',
      p_batch: crypto.randomUUID(),
      p_segments: 1,
    })
    expect(logId).toBeNull()
  })

  it('set_sms_log_status flips a row to failed after a real send attempt fails', async () => {
    const { data: logId } = await anonClient().rpc('record_absence_sms', {
      job_secret: SECRET,
      p_school: schoolIdA,
      p_student: studentId,
      p_rule: rule,
      p_sent_on: '2026-06-02',
      p_phone: '01700000001',
      p_body: 'absent 1 working day',
      p_provider: 'log',
      p_batch: crypto.randomUUID(),
      p_segments: 1,
    })
    expect(logId).toBeTruthy()

    const { error: statusError } = await anonClient().rpc('set_sms_log_status', {
      job_secret: SECRET,
      p_id: logId,
      p_status: 'failed',
    })
    expect(statusError).toBeNull()

    const { data: row } = await ownerA.from('sms_log').select('status').eq('id', logId).single()
    expect(row?.status).toBe('failed')
  })

  it('set_sms_log_status rejects a wrong job secret', async () => {
    const { error } = await anonClient().rpc('set_sms_log_status', { job_secret: 'nope', p_id: crypto.randomUUID(), p_status: 'failed' })
    expect(error).not.toBeNull()
  })
})
