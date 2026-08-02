import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { ensureWallet, postToWallet, walletBalance } from '@/lib/engines/financial/wallet'

// Wallet primitive (map #258, #265) against live Supabase: ensure idempotency,
// dual amount/quantity ledger, entry idempotency, owner-scoped RLS, authority.
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
    // Clean prior ledger for a deterministic balance.
    await superClient.from('wallet_ledger_entries').delete().eq('wallet_id', schoolWallet)
  })

  afterAll(async () => {
    await superClient.from('wallet_ledger_entries').delete().eq('wallet_id', schoolWallet)
  })

  it('ensure is idempotent (one wallet per type+owner)', async () => {
    const again = await ensureWallet(superClient, { walletType: 'school_sms', schoolId: schoolA })
    expect(again).toBe(schoolWallet)
  })

  it('accumulates dual amount + quantity across entries', async () => {
    await postToWallet(superClient, {
      walletId: schoolWallet, amount: 5000, quantity: 100, route: null, ref: 'buy-1', reason: 'allocate',
    })
    await postToWallet(superClient, {
      walletId: schoolWallet, amount: null, quantity: -10, route: 'mask', ref: 'send-1', reason: 'send',
    })
    const bal = await walletBalance(superClient, schoolWallet)
    expect(bal.quantity).toBe(90)
    expect(bal.amount).toBe(5000)
  })

  it('is idempotent on (wallet, ref)', async () => {
    const first = await postToWallet(superClient, {
      walletId: schoolWallet, amount: null, quantity: 100, route: null, ref: 'buy-1', reason: 'allocate',
    })
    // Same ref returns the existing entry and does not double-count.
    expect(first).toBeTruthy()
    const bal = await walletBalance(superClient, schoolWallet)
    expect(bal.quantity).toBe(90)
  })

  it('owner reads own school wallet balance, not another tenant’s', async () => {
    const bal = await walletBalance(owner, schoolWallet)
    expect(bal.quantity).toBe(90)
    await expect(walletBalance(ownerB, schoolWallet)).rejects.toThrow()
  })

  it('blocks direct posts by non-super/non-system callers', async () => {
    await expect(
      postToWallet(owner, {
        walletId: schoolWallet, amount: null, quantity: 999, route: null, ref: 'hack-1', reason: 'x',
      }),
    ).rejects.toThrow()
    // But a system caller (reconcile secret) may post.
    await postToWallet(
      owner,
      { walletId: schoolWallet, amount: null, quantity: 5, route: null, ref: 'sys-1', reason: 'system' },
      SECRET,
    )
    const bal = await walletBalance(superClient, schoolWallet)
    expect(bal.quantity).toBe(95)
  })
})
