import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { ensureWallet, postToWallet, walletBalance } from '@/lib/engines/financial/wallet'

// Wallet primitive (map #258, #265) against live Supabase. The school_sms wallet
// is shared with the SMS suites, so every balance check is asserted as a DELTA
// against a fresh read (isolation-proof) rather than an absolute value.
const SECRET = process.env.RECONCILE_SECRET as string

describe('Wallet primitive (#265)', () => {
  let superClient: SupabaseClient
  let owner: SupabaseClient
  let ownerB: SupabaseClient
  let schoolA: string
  let schoolWallet: string

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
    owner = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    const a = (await owner.auth.getUser()).data.user!
    schoolA = (await owner.from('profiles').select('school_id').eq('id', a.id).single()).data!.school_id
    schoolWallet = await ensureWallet(superClient, { walletType: 'school_sms', schoolId: schoolA })
  })

  it('ensure is idempotent (one wallet per type+owner)', async () => {
    const again = await ensureWallet(superClient, { walletType: 'school_sms', schoolId: schoolA })
    expect(again).toBe(schoolWallet)
  })

  it('accumulates dual amount + quantity across entries', async () => {
    const before = await walletBalance(superClient, schoolWallet)
    const ref = crypto.randomUUID()
    await postToWallet(superClient, {
      walletId: schoolWallet, amount: 5000, quantity: 100, route: null, ref: `buy-${ref}`, reason: 'allocate',
    })
    await postToWallet(superClient, {
      walletId: schoolWallet, amount: null, quantity: -10, route: 'mask', ref: `send-${ref}`, reason: 'send',
    })
    const after = await walletBalance(superClient, schoolWallet)
    expect(after.quantity - before.quantity).toBe(90)
    expect(after.amount - before.amount).toBe(5000)
  })

  it('is idempotent on (wallet, ref)', async () => {
    const ref = `idem-${crypto.randomUUID()}`
    await postToWallet(superClient, { walletId: schoolWallet, amount: null, quantity: 100, route: null, ref, reason: 'allocate' })
    const mid = await walletBalance(superClient, schoolWallet)
    // Same ref returns the existing entry and does not double-count.
    await postToWallet(superClient, { walletId: schoolWallet, amount: null, quantity: 100, route: null, ref, reason: 'allocate' })
    const after = await walletBalance(superClient, schoolWallet)
    expect(after.quantity).toBe(mid.quantity)
  })

  it('owner reads own school wallet balance, not another tenant’s', async () => {
    await expect(walletBalance(owner, schoolWallet)).resolves.toBeDefined()
    await expect(walletBalance(ownerB, schoolWallet)).rejects.toThrow()
  })

  it('blocks direct posts by non-super/non-system callers', async () => {
    await expect(
      postToWallet(owner, {
        walletId: schoolWallet, amount: null, quantity: 999, route: null, ref: `hack-${crypto.randomUUID()}`, reason: 'x',
      }),
    ).rejects.toThrow()
    // A system caller (reconcile secret) may post.
    const before = await walletBalance(superClient, schoolWallet)
    await postToWallet(
      owner,
      { walletId: schoolWallet, amount: null, quantity: 5, route: null, ref: `sys-${crypto.randomUUID()}`, reason: 'system' },
      SECRET,
    )
    const after = await walletBalance(superClient, schoolWallet)
    expect(after.quantity - before.quantity).toBe(5)
  })
})
