import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// written for migration 0232 — NOT RUN (the migration is not applied, and the
// integration suite writes to the shared database).
// Seam: a director capital transaction cannot be deleted or re-valued by a
// School member, so the stored balance cannot drift from its rows (#681).
//
// Leaves two rows behind on purpose (an invest and the withdraw that settles
// it): after 0232 they cannot be deleted by the owner, and that is the point.
// The operations-delete branch (SQL editor / service role reverses the balance
// and posts a contra) is not exercised here: it needs a service-role client,
// which these suites do not hold.

describe('director capital guard (#681, 0232)', () => {
  let owner: SupabaseClient
  let txnId: string
  let startBalance: number

  const balance = async () =>
    Number((await owner.from('director_capital_balances').select('balance').maybeSingle()).data?.balance ?? 0)

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    expect((await owner.auth.getUser()).data.user).not.toBeNull()
    startBalance = await balance()
    const { data, error } = await owner
      .from('director_capital_transactions')
      .insert({ txn_type: 'invest', amount: 700, note: 'Guard Test invest' })
      .select('id')
      .single()
    expect(error).toBeNull()
    txnId = data!.id
  })

  it('the owner cannot delete a transaction, and the balance is untouched', async () => {
    const { error } = await owner.from('director_capital_transactions').delete().eq('id', txnId)
    expect(error?.message).toMatch(/cannot be deleted/i)
    const { data } = await owner.from('director_capital_transactions').select('id').eq('id', txnId)
    expect(data).toHaveLength(1)
    expect(await balance()).toBe(startBalance + 700)
  })

  it('the amount, the type and the stamped balance cannot be changed', async () => {
    for (const patch of [{ amount: 1 }, { txn_type: 'withdraw' }, { balance_after: 0 }]) {
      const { error } = await owner.from('director_capital_transactions').update(patch).eq('id', txnId)
      expect(error?.message).toMatch(/cannot be changed/i)
    }
    expect(await balance()).toBe(startBalance + 700)
  })

  it('the note can still be corrected', async () => {
    const { error } = await owner
      .from('director_capital_transactions')
      .update({ note: 'Guard Test invest (noted)' })
      .eq('id', txnId)
    expect(error).toBeNull()
  })

  it('the correction is the opposite transaction, and it brings the balance back', async () => {
    const { data, error } = await owner
      .from('director_capital_transactions')
      .insert({ txn_type: 'withdraw', amount: 700, note: 'Guard Test settle' })
      .select('balance_after')
      .single()
    expect(error).toBeNull()
    expect(Number(data!.balance_after)).toBe(startBalance)
    expect(await balance()).toBe(startBalance)
  })
})
