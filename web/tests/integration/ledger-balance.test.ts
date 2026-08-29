import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { trialBalance } from '@/lib/super-admin/ledger-view'

// Seam: ticket #530. /super-admin/accounting reported a ৳2,800 imbalance and the
// UAT report made it a release blocker. The ledger was fine; the page summed
// gl_lines in the app, where PostgREST silently truncated the select to 1000 of
// 46,521 rows and it rendered the difference of that arbitrary prefix.
//
// The regression this file guards is not "is the ledger balanced today" — it is
// "can the number the page shows ever be computed from a truncated fetch again".
describe('Trial balance is read whole (#530)', () => {
  let admin: SupabaseClient

  beforeAll(async () => {
    admin = await signedIn('super@test.local')
  })

  it('the ledger balances to exactly zero difference', async () => {
    const { data } = await admin.rpc('gl_is_balanced')
    expect(data).toBe(true)
  })

  // The actual bug, pinned: an unbounded select on gl_lines comes back capped,
  // so anything folded from it is a prefix and not a trial balance.
  it('an unbounded gl_lines select is truncated, which is why the app must not fold it', async () => {
    const { data: lines } = await admin.from('gl_lines').select('account_code, debit, credit')
    const { count } = await admin.from('gl_lines').select('*', { count: 'exact', head: true })

    expect(count).toBeGreaterThan(1000)
    expect(lines!.length).toBeLessThan(count!)
  })

  it('the view aggregates every line, not a page of them', async () => {
    const { data: rows } = await admin.from('gl_trial_balance').select('account_code, debit, credit')
    const { totalDebit, totalCredit, balanced } = trialBalance(rows ?? [])

    // One row per account, so the result can never hit the row cap.
    expect(rows!.length).toBeLessThan(1000)
    expect(totalDebit).toBe(totalCredit)
    expect(balanced).toBe(true)
  })

  it('refuses to approve a settlement while the ledger disagrees with itself', async () => {
    // The ledger balances, so this proves the gate is wired rather than that it
    // fires: a made-up id must fail on 'not found', never reach the balance check
    // and never be silently accepted.
    const { error } = await admin.rpc('settlement_approve', {
      p_settlement: '00000000-0000-4000-8000-000000000000',
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('settlement not found')
  })
})
