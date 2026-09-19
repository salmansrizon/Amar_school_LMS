import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Office Hour (issue #643, ADR 0026): category_office_hours' schema/RLS
// contract. Requires the 0205_category_office_hours.sql migration to already
// be applied to the target Supabase project — this repo's migrations are
// committed as history and applying a new one to the live project (staging
// and main share one project) is a separate, explicit step outside this
// change, same convention documented in issue #642's PR.

const TAG = 'ZZ643officehour'

describe('category_office_hours (issue #643)', () => {
  let owner: SupabaseClient
  let otherOwner: SupabaseClient
  let schoolId: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    otherOwner = await signedIn('owner-b@test.local')
    const { data: schoolIdData } = await owner.rpc('app_current_school_id')
    schoolId = schoolIdData as string

    // Idempotent cleanup of prior runs.
    await owner.from('category_office_hours').delete().eq('employee_category', 'Teacher').eq('day_of_week', 0).eq('start_time', '08:00:00')
    await owner.from('category_office_hours').delete().eq('employee_category', 'Accountant').eq('day_of_week', 0).eq('start_time', '09:00:00')
  })

  afterAll(async () => {
    await owner.from('category_office_hours').delete().eq('employee_category', 'Teacher').eq('day_of_week', 0)
    await owner.from('category_office_hours').delete().eq('employee_category', 'Accountant').eq('day_of_week', 0)
    await owner.from('category_office_hours').delete().eq('employee_category', 'Teacher').eq('day_of_week', 1)
  })

  it('rejects end_time <= start_time (category_office_hours_time_order)', async () => {
    const { error } = await owner.from('category_office_hours').insert({
      shift: null,
      employee_category: 'Teacher',
      day_of_week: 0,
      start_time: '14:00',
      end_time: '08:00',
    })
    expect(error).not.toBeNull()
  })

  it('rejects an employee_category outside the fixed vocabulary', async () => {
    const { error } = await owner.from('category_office_hours').insert({
      shift: null,
      employee_category: TAG,
      day_of_week: 0,
      start_time: '08:00',
      end_time: '09:00',
    })
    expect(error).not.toBeNull()
  })

  it('rejects a shift outside the fixed vocabulary', async () => {
    const { error } = await owner.from('category_office_hours').insert({
      shift: 'Noon',
      employee_category: 'Teacher',
      day_of_week: 0,
      start_time: '08:00',
      end_time: '09:00',
    })
    expect(error).not.toBeNull()
  })

  it('collides on (school_id, shift, employee_category, day_of_week) even with shift null (nulls not distinct)', async () => {
    const first = await owner.from('category_office_hours').insert({
      shift: null,
      employee_category: 'Teacher',
      day_of_week: 0,
      start_time: '08:00',
      end_time: '14:00',
    })
    expect(first.error).toBeNull()

    const duplicate = await owner.from('category_office_hours').insert({
      shift: null,
      employee_category: 'Teacher',
      day_of_week: 0,
      start_time: '09:00',
      end_time: '15:00',
    })
    expect(duplicate.error).not.toBeNull()
  })

  it('bulk upsert (2 categories x 2 days) creates exactly 4 rows in one call, atomically', async () => {
    const rows = [
      { shift: null, employee_category: 'Teacher', day_of_week: 1, start_time: '08:00', end_time: '13:00' },
      { shift: null, employee_category: 'Teacher', day_of_week: 2, start_time: '08:00', end_time: '13:00' },
      { shift: null, employee_category: 'Accountant', day_of_week: 1, start_time: '09:00', end_time: '17:00' },
      { shift: null, employee_category: 'Accountant', day_of_week: 2, start_time: '09:00', end_time: '17:00' },
    ]
    const { error } = await owner
      .from('category_office_hours')
      .upsert(rows, { onConflict: 'school_id,shift,employee_category,day_of_week' })
    expect(error).toBeNull()

    const { data } = await owner
      .from('category_office_hours')
      .select('id')
      .in('employee_category', ['Teacher', 'Accountant'])
      .in('day_of_week', [1, 2])
      .is('shift', null)
    expect(data).toHaveLength(4)

    await owner.from('category_office_hours').delete().in('employee_category', ['Teacher', 'Accountant']).in('day_of_week', [1, 2]).is('shift', null)
  })

  it('re-saving the same combination updates the existing row instead of duplicating it', async () => {
    const upsertOnce = () =>
      owner.from('category_office_hours').upsert(
        { shift: null, employee_category: 'Teacher', day_of_week: 0, start_time: '08:00', end_time: '14:00' },
        { onConflict: 'school_id,shift,employee_category,day_of_week' },
      )
    await upsertOnce()
    const { error } = await owner
      .from('category_office_hours')
      .upsert(
        { shift: null, employee_category: 'Teacher', day_of_week: 0, start_time: '08:00', end_time: '13:00' },
        { onConflict: 'school_id,shift,employee_category,day_of_week' },
      )
    expect(error).toBeNull()

    const { data } = await owner
      .from('category_office_hours')
      .select('end_time')
      .eq('employee_category', 'Teacher')
      .eq('day_of_week', 0)
      .is('shift', null)
    expect(data).toHaveLength(1)
    expect(data![0]!.end_time).toBe('13:00:00')
  })

  it("a plain update that would collide with another row is rejected, not silently merged (inline-edit's block-on-conflict rule)", async () => {
    await owner.from('category_office_hours').upsert(
      { shift: null, employee_category: 'Accountant', day_of_week: 0, start_time: '09:00', end_time: '17:00' },
      { onConflict: 'school_id,shift,employee_category,day_of_week' },
    )
    const { data: teacherRow } = await owner
      .from('category_office_hours')
      .select('id')
      .eq('employee_category', 'Teacher')
      .eq('day_of_week', 0)
      .is('shift', null)
      .single()

    // Moving Teacher/Sunday onto Accountant/Sunday's identity must fail, never
    // silently overwrite Accountant's row.
    const { error } = await owner
      .from('category_office_hours')
      .update({ employee_category: 'Accountant' })
      .eq('id', teacherRow!.id)
    expect(error).not.toBeNull()
  })

  it("a School cannot read another School's Office Hours (RLS)", async () => {
    const { data } = await otherOwner
      .from('category_office_hours')
      .select('id')
      .eq('employee_category', 'Teacher')
      .eq('day_of_week', 0)
    expect(data).toEqual([])
  })

  it("narrowing configured_shifts never deletes or rewrites an existing Office Hour row for that Shift", async () => {
    const { data: school } = await owner.from('schools').select('configured_shifts').eq('id', schoolId).single()
    const original = school!.configured_shifts as string[]

    await owner.from('schools').update({ configured_shifts: [...new Set([...original, 'Evening'])] }).eq('id', schoolId)
    const { error: insertErr } = await owner.from('category_office_hours').insert({
      shift: 'Evening',
      employee_category: 'Librarian',
      day_of_week: 3,
      start_time: '08:00',
      end_time: '12:00',
    })
    expect(insertErr).toBeNull()

    await owner.from('schools').update({ configured_shifts: original.filter((s) => s !== 'Evening') }).eq('id', schoolId)
    const { data: stillThere } = await owner
      .from('category_office_hours')
      .select('id')
      .eq('employee_category', 'Librarian')
      .eq('shift', 'Evening')
      .eq('day_of_week', 3)
      .maybeSingle()
    expect(stillThere).not.toBeNull()

    await owner.from('category_office_hours').delete().eq('employee_category', 'Librarian').eq('shift', 'Evening')
    await owner.from('schools').update({ configured_shifts: original }).eq('id', schoolId)
  })
})
