import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { acceptAgreement } from '@/lib/partner'

// Distributor agreement versioning + acceptance metadata (#271, doc 002).
describe('Distributor agreement acceptance (#270 follow-up)', () => {
  let superClient: SupabaseClient
  let distA: SupabaseClient
  let distId: string

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
    distA = await signedIn('owner-a@test.local')
    distId = (await distA.auth.getUser()).data.user!.id
    await superClient.from('distributor_profiles').upsert({ profile_id: distId, status: 'pending', agreement_status: 'pending' })
    await superClient.from('distributor_agreement_acceptances').delete().eq('distributor_id', distId)
  })

  afterAll(async () => {
    await superClient.from('distributor_agreement_acceptances').delete().eq('distributor_id', distId)
    await superClient.from('distributor_profiles').delete().eq('profile_id', distId)
  })

  it('records acceptance metadata and flips the agreement status', async () => {
    await acceptAgreement(distA, { version: 1, ip: '203.0.113.7', device: 'Chrome/Mac' })
    const acc = (await distA
      .from('distributor_agreement_acceptances')
      .select('agreement_version, ip, device')
      .eq('distributor_id', distId)
      .single()).data!
    expect(acc.agreement_version).toBe(1)
    expect(acc.ip).toBe('203.0.113.7')
    expect(acc.device).toBe('Chrome/Mac')

    const prof = (await superClient.from('distributor_profiles').select('agreement_status, agreement_signed_at').eq('profile_id', distId).single()).data!
    expect(prof.agreement_status).toBe('accepted')
    expect(prof.agreement_signed_at).not.toBeNull()
  })

  it('rejects accepting on behalf of another distributor (non-system)', async () => {
    await expect(
      acceptAgreement(distA, { version: 1, distributorId: '00000000-0000-0000-0000-0000000000ff' }),
    ).rejects.toThrow()
  })
})
