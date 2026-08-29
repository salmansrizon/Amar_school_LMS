import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: migration 0168 / ticket #547. ADR 0012 requires gapless per-year invoice
// numbering, and the implementation used a Postgres sequence — which cannot be
// gapless, by its own documented design. nextval is deliberately
// non-transactional, so a number taken by a transaction that later rolled back was
// gone permanently: 25,251 allocated against 1,276 invoices, with zero drafts.
//
// A far-future year keeps this away from the live counter.
const YEAR = 2099

describe('Invoice numbers are gapless (#547)', () => {
  let admin: SupabaseClient

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
  })

  // Drops the counter rows this file creates, which it can only do because 0169
  // gave the Super Admin a policy on this table. The first version of that
  // migration left it with RLS on and no policies, so this delete removed nothing
  // and reported no error — the same silent no-op this suite already hit once on
  // student_profile_change_requests.
  afterAll(async () => {
    await admin.from('invoice_number_counters').delete().gte('year', YEAR)
  })

  it('allocates consecutively', async () => {
    const first = await admin.rpc('invoice_number_next', { p_year: YEAR })
    const second = await admin.rpc('invoice_number_next', { p_year: YEAR })
    expect(Number(second.data)).toBe(Number(first.data) + 1)
  })

  it('starts a new financial year at 1 without a seeding step', async () => {
    const fresh = YEAR + 1
    const { data } = await admin.rpc('invoice_number_next', { p_year: fresh })
    expect(Number(data)).toBe(1)
  })

  // The property the sequence could not provide, and the whole reason for the
  // change: an abandoned allocation comes back.
  it('returns a number taken by a transaction that rolls back', async () => {
    const { data: before } = await admin.rpc('invoice_number_next', { p_year: YEAR })

    // invoice_create allocates, then fails on its own validation *after* the
    // allocation would once have been burned. A sequence would have kept it.
    const { error } = await admin.rpc('invoice_create', {
      p_school_id: '00000000-0000-4000-8000-000000000000',
      p_lines: [{ description: 'zero', quantity: 1, unit_amount: 0 }],
    })
    expect(error).not.toBeNull()

    const { data: after } = await admin.rpc('invoice_number_next', { p_year: YEAR })
    expect(Number(after)).toBe(Number(before) + 1)
  })
})
