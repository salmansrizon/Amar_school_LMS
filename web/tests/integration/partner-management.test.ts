import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { assignAgent, createLead, setDistributorStatus, setLeadStage } from '@/lib/partner'

// Partner Management (map #258, #270) against live Supabase. owner-a/b stand in
// as distributors (real distributor role lands with the deferred rename); tests
// CRM ownership, lifecycle + event, agent assignment, authority.
describe('Partner Management (#270)', () => {
  let superClient: SupabaseClient
  let distA: SupabaseClient
  let distB: SupabaseClient
  let distAId: string
  let agentId: string

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
    distA = await signedIn('owner-a@test.local')
    distB = await signedIn('owner-b@test.local')
    distAId = (await distA.auth.getUser()).data.user!.id
    agentId = (await signedIn('staff-a1@test.local').then((c) => c.auth.getUser())).data.user!.id
    await superClient.from('distributor_profiles').upsert({ profile_id: distAId, status: 'pending' })
    await superClient.from('leads').delete().eq('distributor_id', distAId)
    await superClient.from('agent_assignments').delete().eq('agent_id', agentId)
  })

  afterAll(async () => {
    await superClient.from('leads').delete().eq('distributor_id', distAId)
    await superClient.from('agent_assignments').delete().eq('agent_id', agentId)
    await superClient.from('distributor_profiles').delete().eq('profile_id', distAId)
  })

  it('scopes CRM leads to the owning distributor', async () => {
    const id = await createLead(distA, { distributorId: distAId, schoolName: 'Prospect High' })
    await setLeadStage(distA, id, 'demo')
    const mine = (await distA.from('leads').select('stage').eq('id', id).single()).data!
    expect(mine.stage).toBe('demo')
    const theirs = (await distB.from('leads').select('id').eq('id', id)).data ?? []
    expect(theirs).toHaveLength(0)
  })

  it('sets distributor status (super) with event + audit', async () => {
    await setDistributorStatus(superClient, distAId, 'approved')
    const row = (await superClient.from('distributor_profiles').select('status').eq('profile_id', distAId).single()).data!
    expect(row.status).toBe('approved')

    const event = (await superClient
      .from('domain_events')
      .select('id')
      .eq('type', 'DistributorApproved')
      .filter('payload->>distributor', 'eq', distAId)).data ?? []
    expect(event.length).toBeGreaterThanOrEqual(1)
  })

  it('assigns an agent the agent can see', async () => {
    await assignAgent(superClient, agentId, distAId)
    const agent = await signedIn('staff-a1@test.local')
    const mine = (await agent.from('agent_assignments').select('distributor_id').eq('agent_id', agentId).single()).data!
    expect(mine.distributor_id).toBe(distAId)
  })

  it('blocks non-super status changes', async () => {
    await expect(setDistributorStatus(distA, distAId, 'blocked')).rejects.toThrow()
  })
})
