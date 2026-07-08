import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: subscription_codes schema + generate/redeem/decrease RPCs (issues #5, #6).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

function isoDatePlusMonths(base: Date, months: number): string {
  const d = new Date(base)
  const day = d.getUTCDate()
  d.setUTCMonth(d.getUTCMonth() + months)
  if (d.getUTCDate() !== day) d.setUTCDate(0) // clamp like Postgres make_interval
  return d.toISOString().slice(0, 10)
}

describe('Subscription Codes (issue #5) + manual expiry correction (issue #6)', () => {
  let admin: SupabaseClient
  let schoolBId: string  // per-run throwaway school (redemption is permanent, so no reset is possible)

  const generatedCodes: string[] = []

  async function generate(count: number, months: number, price: number) {
    const result = await admin.rpc('generate_code_batch', {
      batch_count: count,
      validity_months: months,
      code_price: price,
    })
    if (result.data) generatedCodes.push(...(result.data as { code: string }[]).map((c) => c.code))
    return result
  }

  async function status(schoolId: string) {
    const { data } = await admin.rpc('school_subscription_status', { sid: schoolId })
    return data as string
  }

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
    // Redemption is permanent (trigger-enforced), so each run gets a fresh
    // throwaway school. Used codes pin it in the DB — a tiny, acceptable
    // residue in the dev project.
    const { data, error } = await admin
      .from('schools')
      .insert({ name: `ZZ Codes Test ${crypto.randomUUID().slice(0, 8)}` })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    schoolBId = data.id
  })

  afterAll(async () => {
    // Remove only THIS run's leftover unused codes — never touch codes a real
    // admin may have pre-generated. (Used ones are undeletable by design.)
    if (generatedCodes.length) {
      await admin.from('subscription_codes').delete().in('code', generatedCodes).is('redeemed_at', null)
    }
  })

  it('generates a batch of unique codes with validity and price', async () => {
    const { data, error } = await generate(3, 6, 0)
    expect(error).toBeNull()
    const codes = data as { code: string }[]
    expect(codes).toHaveLength(3)
    expect(new Set(codes.map((c) => c.code)).size).toBe(3)
  })

  it('rejects out-of-range batch size and validity', async () => {
    expect((await generate(0, 6, 0)).error).not.toBeNull()
    expect((await generate(51, 6, 0)).error).not.toBeNull()
    expect((await generate(5, 25, 0)).error).not.toBeNull()
    expect((await generate(5, 6, -1)).error).not.toBeNull()
  })

  it('a School with no code history is in Trial; redeeming a price-0 code ends it permanently', async () => {
    expect(await status(schoolBId)).toBe('trial')

    const { data } = await generate(1, 2, 0)
    const code = (data as { code: string }[])[0].code
    const { error } = await admin.rpc('redeem_code', { code_text: code, sid: schoolBId })
    expect(error).toBeNull()

    expect(await status(schoolBId)).toBe('active')
    const { data: school } = await admin.from('schools').select('subscription_expires_at').eq('id', schoolBId).single()
    expect(school!.subscription_expires_at).toBe(isoDatePlusMonths(new Date(), 2))
  })

  it('redeeming while active stacks onto the existing expiry', async () => {
    const { data: before } = await admin.from('schools').select('subscription_expires_at').eq('id', schoolBId).single()
    const { data } = await generate(1, 3, 100)
    const code = (data as { code: string }[])[0].code
    await admin.rpc('redeem_code', { code_text: code, sid: schoolBId })

    const { data: after } = await admin.from('schools').select('subscription_expires_at').eq('id', schoolBId).single()
    expect(after!.subscription_expires_at).toBe(
      isoDatePlusMonths(new Date(before!.subscription_expires_at + 'T00:00:00Z'), 3),
    )
  })

  it('a lapsed School starts fresh from the redemption date, not the stale expiry', async () => {
    await admin.from('schools').update({ subscription_expires_at: '2024-01-01' }).eq('id', schoolBId)
    const { data } = await generate(1, 1, 50)
    const code = (data as { code: string }[])[0].code
    await admin.rpc('redeem_code', { code_text: code, sid: schoolBId })

    const { data: school } = await admin.from('schools').select('subscription_expires_at').eq('id', schoolBId).single()
    expect(school!.subscription_expires_at).toBe(isoDatePlusMonths(new Date(), 1))
  })

  it('a code cannot be redeemed twice', async () => {
    const { data } = await generate(1, 1, 0)
    const code = (data as { code: string }[])[0].code
    expect((await admin.rpc('redeem_code', { code_text: code, sid: schoolBId })).error).toBeNull()
    expect((await admin.rpc('redeem_code', { code_text: code, sid: schoolBId })).error).not.toBeNull()
  })

  it('a redeemed code cannot be un-redeemed, even by a Super Admin', async () => {
    const { data } = await generate(1, 1, 0)
    const code = (data as { code: string }[])[0].code
    await admin.rpc('redeem_code', { code_text: code, sid: schoolBId })

    const { error } = await admin
      .from('subscription_codes')
      .update({ redeemed_school_id: null, redeemed_at: null })
      .eq('code', code)
    expect(error).not.toBeNull()
  })

  it('a used code cannot be deleted; an unused one can', async () => {
    const { data } = await generate(2, 1, 0)
    const [used, unused] = (data as { code: string }[]).map((c) => c.code)
    await admin.rpc('redeem_code', { code_text: used, sid: schoolBId })

    await admin.from('subscription_codes').delete().eq('code', used)
    const { data: stillThere } = await admin.from('subscription_codes').select('code').eq('code', used)
    expect(stillThere).toHaveLength(1)

    await admin.from('subscription_codes').delete().eq('code', unused)
    const { data: gone } = await admin.from('subscription_codes').select('code').eq('code', unused)
    expect(gone).toHaveLength(0)
  })

  it('decrease_expiry reduces an active expiry with the rule-set from issue #6', async () => {
    // Active school (expiry stacked well into the future from prior tests).
    const { data: before } = await admin.from('schools').select('subscription_expires_at').eq('id', schoolBId).single()
    const { error } = await admin.rpc('decrease_expiry', { sid: schoolBId, months: 1 })
    expect(error).toBeNull()
    const { data: after } = await admin.from('schools').select('subscription_expires_at').eq('id', schoolBId).single()
    expect(after!.subscription_expires_at).toBe(
      isoDatePlusMonths(new Date(before!.subscription_expires_at + 'T00:00:00Z'), -1),
    )
  })

  it('decrease_expiry is unavailable for a Trial School', async () => {
    const { data: schoolA } = await admin.from('schools').select('id').eq('name', 'Test School A').single()
    const { error } = await admin.rpc('decrease_expiry', { sid: schoolA!.id, months: 1 })
    expect(error).not.toBeNull()
  })

  it('decrease_expiry is a no-op for an already-expired School', async () => {
    await admin.from('schools').update({ subscription_expires_at: '2024-06-01' }).eq('id', schoolBId)
    const { error } = await admin.rpc('decrease_expiry', { sid: schoolBId, months: 1 })
    expect(error).toBeNull()
    const { data: school } = await admin.from('schools').select('subscription_expires_at').eq('id', schoolBId).single()
    expect(school!.subscription_expires_at).toBe('2024-06-01')
  })

  it('a School Owner cannot generate codes', async () => {
    const owner = await signedIn('owner-a@test.local')
    const { error } = await owner.rpc('generate_code_batch', {
      batch_count: 1,
      validity_months: 1,
      code_price: 0,
    })
    expect(error).not.toBeNull()
  })
})
