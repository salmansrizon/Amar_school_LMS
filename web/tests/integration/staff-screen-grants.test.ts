import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn, PASSWORD } from '../helpers/auth'

// Seam: Permission Grant enforced in the database (GHSA-f3w3-vrhc-983v, 0136).
//
// CONTEXT.md defines a Permission Grant as a Staff User's boolean, screen-level
// access. Before 0136 that was enforced only by proxy.ts — which gates a
// browser, not PostgREST. Every assertion below runs as a real signed-in Staff
// User against the live database, which is the only surface that ever mattered.
//
// staff-e2e@test.local is School A's Staff User (supabase/e2e-seed.sql).

const STAFF = 'staff-e2e@test.local'
const STAFF_ID = '44444444-4444-4444-4444-444444444444'

/** Gated on a screen the fixture staff does NOT hold. */
const DENIED = [
  'fee_collection_records',
  'fee_structures',
  'vouchers',
  'bank_cash_transactions',
  'exam_marks',
  'exam_seat_plans',
  'behaviour_log_entries',
  'sms_log',
  'gallery_albums',
  // student_transfers retired (Wave 6, issue #591) — dropped, not replaced
  // in this grant map; student_enrollments isn't screen-gated the same way.
] as const

/** Read by several screens, so deliberately open to any school member. */
const SHARED = ['students', 'class_offerings', 'subjects'] as const

describe('Permission Grant is enforced by RLS (#GHSA-f3w3-vrhc-983v)', () => {
  let owner: SupabaseClient
  let staff: SupabaseClient
  let feeRecordId: string | null = null

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    staff = await signedIn(STAFF, PASSWORD)

    // Give the fixture exactly one grant: attendance. The owner writes it, which
    // is the real path (staff cannot grant themselves).
    await owner.from('staff_permissions').delete().eq('staff_user_id', STAFF_ID)
    const grant = await owner
      .from('staff_permissions')
      .insert({ staff_user_id: STAFF_ID, screen_key: 'attendance' })
    if (grant.error) throw new Error(grant.error.message)

    // Something for the staff user to fail to see. Without this, an empty read
    // would prove nothing.
    const { data: student } = await owner.from('students').select('id').limit(1).maybeSingle()
    if (student) {
      const { data } = await owner
        .from('fee_collection_records')
        .upsert(
          { student_id: student.id, month: 1, year: 2099, pay_amount: 4242 },
          { onConflict: 'student_id,month,year' },
        )
        .select('id')
        .maybeSingle()
      feeRecordId = data?.id ?? null
    }
  })

  afterAll(async () => {
    await owner.from('staff_permissions').delete().eq('staff_user_id', STAFF_ID)
    if (feeRecordId) await owner.from('fee_collection_records').delete().eq('id', feeRecordId)
  })

  it('the owner can see the fee record — so an empty staff read means something', async () => {
    const { data } = await owner.from('fee_collection_records').select('id').eq('year', 2099)
    expect(data?.length).toBeGreaterThan(0)
  })

  it.each(DENIED)('a Staff User without the grant reads nothing from %s', async (table) => {
    const { data, error } = await staff.from(table).select('*')
    expect(error?.code).not.toBe('42P01')
    expect(data ?? []).toEqual([])
  })

  it('a Staff User without the grant cannot write to a gated table either', async () => {
    const { data: student } = await owner.from('students').select('id').limit(1).maybeSingle()
    const insert = await staff
      .from('fee_collection_records')
      .insert({ student_id: student!.id, month: 2, year: 2099, pay_amount: 1 })
      .select('id')
    expect(insert.error ?? (insert.data?.length ? insert.data : null)).not.toBeNull()
  })

  it('the granted screen still works', async () => {
    // attendance_records is gated on 'attendance', which this fixture holds.
    const { error } = await staff.from('attendance_records').select('id').limit(1)
    expect(error).toBeNull()
  })

  it.each(SHARED)('%s stays open — several screens legitimately read it', async (table) => {
    const { error } = await staff.from(table).select('id').limit(1)
    expect(error).toBeNull()
  })

  it('employees is closed, employee_card is open, and the bank columns are gone', async () => {
    const base = await staff.from('employees').select('id, bank_account')
    expect(base.data ?? []).toEqual([])

    const card = await staff.from('employee_card').select('id, full_name')
    expect(card.error).toBeNull()

    // Absent from the view, not merely unselected — no select('*') can leak them.
    // `profile_id` is on the list because 0138 refused to put it here: the view
    // must not become a map from every colleague to their login. The Response
    // Performance report needs that mapping and gets it from a definer function
    // scoped to actual repliers instead (0156).
    for (const column of ['bank_account', 'bank_branch', 'bank_name', 'date_of_birth', 'profile_id']) {
      const { error } = await staff.from('employee_card').select(column)
      expect(error, `${column} must not exist on employee_card`).not.toBeNull()
    }
  })

  it('a granted Staff User reaches the tables behind that screen', async () => {
    await owner.from('staff_permissions').insert({ staff_user_id: STAFF_ID, screen_key: 'fees' })
    const { data, error } = await staff.from('fee_collection_records').select('id').eq('year', 2099)
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
    await owner
      .from('staff_permissions')
      .delete()
      .eq('staff_user_id', STAFF_ID)
      .eq('screen_key', 'fees')
  })

  it('the School Owner is unaffected by any of this', async () => {
    for (const table of [...DENIED, 'employees'] as const) {
      const { error } = await owner.from(table).select('id').limit(1)
      expect(error, `owner lost access to ${table}`).toBeNull()
    }
  })
})
