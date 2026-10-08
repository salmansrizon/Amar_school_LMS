import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, anonClient } from '../helpers/auth'

// Written for migration 0250 (#703 item 4.5) — NOT RUN (the integration suite
// writes to the shared database). Needs 0218 and 0250 applied; before 0250 the
// streaks below read 4 and 3 instead of 2 and 1.
//
// Seam: the streak walk in absence_sms_candidates steps over the School's
// weekly off-days. It only calls the candidates function; nothing is sent.
// Like absent-day-weekly-off.test.ts it sets schools.weekly_off_days for Test
// School A while it runs and restores it afterwards.
//
// 2098-04-06 is a Sunday (2098-03-02 is, per absent-day-weekly-off.test.ts).
const WED = '2098-04-02'
const THU = '2098-04-03'
const FRI = '2098-04-04'
const SUN = '2098-04-06'
const TAG = 'M0250'
const SECRET = process.env.RECONCILE_SECRET!

describe('Absence SMS streak and weekly off-days (migration 0250)', () => {
  let owner: SupabaseClient
  let admin: SupabaseClient
  let schoolId: string
  let originalWeeklyOff: number[]
  let ruleIds: string[] = []
  const students: Record<string, string> = {}

  const streakOf = async (sid: string, day: string) => {
    const { data, error } = await anonClient().rpc('absence_sms_candidates', { job_secret: SECRET, target_date: day })
    if (error) throw new Error(error.message)
    return (data as { student_id: string; streak: number }[]).filter((r) => r.student_id === sid).map((r) => r.streak)
  }
  const present = async (sid: string, day: string) => {
    const { error } = await admin.from('attendance_records').insert({
      school_id: schoolId,
      person_type: 'student',
      person_id: sid,
      att_date: day,
      entry_at: `${day}T08:00:00Z`,
      status: 'present',
    })
    if (error) throw new Error(error.message)
  }
  async function cleanup() {
    const { data } = await owner.from('students').select('id').like('full_name', `${TAG} %`)
    const ids = (data ?? []).map((s) => s.id)
    if (ids.length) await admin.from('attendance_records').delete().in('person_id', ids)
    await owner.from('students').delete().like('full_name', `${TAG} %`)
  }

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    admin = await signedIn('super@test.local')
    const { data: auth } = await owner.auth.getUser()
    schoolId = (await owner.from('profiles').select('school_id').eq('id', auth.user!.id).single()).data!.school_id
    await cleanup()
    originalWeeklyOff = (await owner.from('schools').select('weekly_off_days').eq('id', schoolId).single()).data!
      .weekly_off_days
    await owner.from('schools').update({ weekly_off_days: [5, 6] }).eq('id', schoolId)

    // Rules for 1, 2 and 3-4 days, so every streak in this file is returned.
    const { data: rules, error } = await owner
      .from('absence_sms_rules')
      .insert([{ exact_days: 1 }, { exact_days: 2 }, { range_from: 3, range_to: 4 }])
      .select('id')
    if (error) throw new Error(error.message)
    ruleIds = rules!.map((r) => r.id)

    for (const key of ['a', 'b', 'f']) {
      const { data: s, error: e } = await owner.from('students').insert({ full_name: `${TAG} ${key}` }).select('id').single()
      if (e) throw new Error(e.message)
      students[key] = s!.id
    }
    await present(students.a, WED) // A: absent Thu and Sun
    await present(students.b, THU) // B: absent Sun only
    await present(students.f, WED) // F: record on the Friday off-day
    await present(students.f, FRI)
  })

  afterAll(async () => {
    if (ruleIds.length) await owner.from('absence_sms_rules').delete().in('id', ruleIds)
    await cleanup()
    if (originalWeeklyOff) await owner.from('schools').update({ weekly_off_days: originalWeeklyOff }).eq('id', schoolId)
  })

  it('A: absent Thursday and Sunday across Fri+Sat reads as 2 days, not 4', async () => {
    expect(await streakOf(students.a, SUN)).toEqual([2])
  })

  it('B: absent Sunday only, present Thursday, reads as 1 day, not 3', async () => {
    expect(await streakOf(students.b, SUN)).toEqual([1])
  })

  it('F: a record on a weekly off-day is stepped over, as an off_days row is', async () => {
    expect(await streakOf(students.f, SUN)).toEqual([2])
  })

  it('no candidate on the weekly off-day itself (0218)', async () => {
    expect(await streakOf(students.a, FRI)).toEqual([])
  })
})
