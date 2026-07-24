import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: time-boxed trials + redefined subscription status (issue #111).

function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

describe('Time-boxed trials + status (issue #111)', () => {
  let admin: SupabaseClient
  let owner: SupabaseClient
  let schoolId: string

  async function status() {
    return (await admin.rpc('school_subscription_status', { sid: schoolId })).data as string
  }

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
    owner = await signedIn('owner@test.local')
    const { data, error } = await admin
      .from('schools')
      .insert({ name: `ZZ Trial ${crypto.randomUUID().slice(0, 8)}` })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    schoolId = data.id
  })

  it('no-history + no expiry → open-ended trial', async () => {
    await admin.from('schools').update({ subscription_expires_at: null }).eq('id', schoolId)
    expect(await status()).toBe('trial')
  })

  it('start_trial sets a future expiry → trial', async () => {
    const { data: expiry, error } = await admin.rpc('start_trial', { sid: schoolId, days: 15 })
    expect(error).toBeNull()
    expect(expiry).toBe(isoDaysFromNow(15))
    expect(await status()).toBe('trial')
  })

  it('a lapsed trial (past expiry, no history) → expired', async () => {
    await admin.from('schools').update({ subscription_expires_at: isoDaysFromNow(-1) }).eq('id', schoolId)
    expect(await status()).toBe('expired')
  })

  it('start_trial default is 15 days', async () => {
    const { data: expiry } = await admin.rpc('start_trial', { sid: schoolId })
    expect(expiry).toBe(isoDaysFromNow(15))
  })

  it('non-super-admin cannot start a trial', async () => {
    const { error } = await owner.rpc('start_trial', { sid: schoolId, days: 15 })
    expect(error).not.toBeNull()
  })

  it('school_owner_email is super-admin-only', async () => {
    const { error } = await owner.rpc('school_owner_email', { sid: schoolId })
    expect(error).not.toBeNull()
    // super-admin gets null for a school with no bound owner (no throw)
    const { data, error: adminErr } = await admin.rpc('school_owner_email', { sid: schoolId })
    expect(adminErr).toBeNull()
    expect(data).toBeNull()
  })
})
