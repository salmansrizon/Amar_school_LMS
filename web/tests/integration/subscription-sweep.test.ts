import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anonClient, signedIn } from '../helpers/auth'

// Recurring billing sweep (#271, doc 003): bills every school once per period.
const SECRET = process.env.RECONCILE_SECRET as string

describe('subscription_billing_sweep (#269 follow-up)', () => {
  let superClient: SupabaseClient
  let owner: SupabaseClient
  let schoolA: string
  // Unique period per run — the runs table is append-only (no delete RLS), so a
  // fresh key guarantees an unbilled period without needing cleanup.
  const period = `t-${crypto.randomUUID().slice(0, 12)}`

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
    owner = await signedIn('owner-a@test.local')
    const a = (await owner.auth.getUser()).data.user!
    schoolA = (await owner.from('profiles').select('school_id').eq('id', a.id).single()).data!.school_id
  })

  it('bills each school once and dedups on re-run', async () => {
    const first = await anonClient().rpc('subscription_billing_sweep', { job_secret: SECRET, p_period: period })
    expect(first.error).toBeNull()
    expect(Number(first.data)).toBeGreaterThanOrEqual(1)

    const run = (await superClient
      .from('subscription_billing_runs')
      .select('invoice_id')
      .eq('school_id', schoolA)
      .eq('period', period)
      .single()).data!
    expect(run.invoice_id).not.toBeNull()

    // Re-run: everything already billed for this period → zero new.
    const second = await anonClient().rpc('subscription_billing_sweep', { job_secret: SECRET, p_period: period })
    expect(Number(second.data)).toBe(0)
  })

  it('rejects a non-system caller', async () => {
    const { error } = await owner.rpc('subscription_billing_sweep', { job_secret: null, p_period: period })
    expect(error).not.toBeNull()
  })
})
