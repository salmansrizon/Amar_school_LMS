import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import {
  accrueCommission,
  approveSettlement,
  resolveDiscount,
  runSettlement,
} from '@/lib/engines/financial/commission'

// Commission + settlement + discount (map #258, #266) against live Supabase.
// Uses the super-admin profile as a stand-in distributor (real distributor
// entities land in #270); exercises accrual -> wallet + GL, settlement payout,
// idempotency, discount resolution, authority.
const SECRET = process.env.RECONCILE_SECRET as string

describe('Commission & settlement (#266)', () => {
  let superClient: SupabaseClient
  let owner: SupabaseClient
  let distId: string

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
    owner = await signedIn('owner-a@test.local')
    distId = (await superClient.auth.getUser()).data.user!.id
  })

  it('accrues subscription commission to wallet + GL, idempotently', async () => {
    const src = crypto.randomUUID()
    const id = await accrueCommission(superClient, {
      distributorId: distId, stream: 'subscription', sourceType: 'invoice', sourceId: src, baseAmount: 200000,
    })
    // 30% of 200000 = 60000.
    const row = (await superClient.from('commissions').select('commission_amount').eq('id', id).single()).data!
    expect(Number(row.commission_amount)).toBe(60000)

    // GL entry balances.
    const entry = (await superClient.from('gl_entries').select('id').eq('ref', `commission:${id}`).single()).data!
    const lines = (await superClient.from('gl_lines').select('debit, credit').eq('entry_id', entry.id)).data ?? []
    expect(lines.reduce((s, l) => s + Number(l.debit), 0)).toBe(60000)
    expect(lines.reduce((s, l) => s + Number(l.credit), 0)).toBe(60000)

    // Idempotent: same source -> same commission id.
    const again = await accrueCommission(superClient, {
      distributorId: distId, stream: 'subscription', sourceType: 'invoice', sourceId: src, baseAmount: 200000,
    })
    expect(again).toBe(id)
  })

  it('runs + approves a settlement, marking commissions settled', async () => {
    const src = crypto.randomUUID()
    await accrueCommission(superClient, {
      distributorId: distId, stream: 'subscription', sourceType: 'settle-test', sourceId: src, baseAmount: 100000,
    })
    const sId = await runSettlement(superClient, {
      distributorId: distId, periodStart: '2020-01-01', periodEnd: '2100-01-01',
    })
    const draft = (await superClient.from('settlements').select('total_amount, status').eq('id', sId).single()).data!
    expect(Number(draft.total_amount)).toBeGreaterThanOrEqual(30000)
    expect(draft.status).toBe('draft')

    await approveSettlement(superClient, sId)
    const paid = (await superClient.from('settlements').select('status').eq('id', sId).single()).data!
    expect(paid.status).toBe('paid')

    const event = (await superClient
      .from('domain_events')
      .select('id')
      .eq('type', 'SettlementCompleted')
      .filter('payload->>settlementId', 'eq', sId)).data ?? []
    expect(event.length).toBeGreaterThanOrEqual(1)
  })

  it('resolves a discount value', async () => {
    await superClient.from('discounts').upsert({ code: 'TEST10', discount_type: 'percent', value: 1000 })
    expect(await resolveDiscount(owner, 'TEST10', 200000)).toBe(20000) // 10%
    expect(await resolveDiscount(owner, 'NOPE', 200000)).toBe(0)
    await superClient.from('discounts').delete().eq('code', 'TEST10')
  })

  it('enforces authority (non-super cannot accrue)', async () => {
    await expect(
      accrueCommission(owner, {
        distributorId: distId, stream: 'subscription', sourceType: 'x', sourceId: crypto.randomUUID(), baseAmount: 1000,
      }),
    ).rejects.toThrow()
  })
})
