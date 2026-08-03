import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anonClient, signedIn } from '../helpers/auth'
import { systemEventEngine } from '@/lib/engines/events/engine'
import { resetRegistry, subscribe } from '@/lib/engines/events/registry'

// Event Architecture outbox (map #258, #260) against live Supabase. Exercises
// the publish_domain_event / claim / mark RPCs, in-process sync dispatch, the
// cron drain path, tenant publish authority, and RLS read scoping.
const SECRET = process.env.RECONCILE_SECRET as string

describe('Event Architecture outbox (#260)', () => {
  let owner: SupabaseClient
  let ownerB: SupabaseClient
  let schoolA: string
  let schoolB: string
  let aId: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    const a = (await owner.auth.getUser()).data.user!
    const b = (await ownerB.auth.getUser()).data.user!
    aId = a.id
    schoolA = (await owner.from('profiles').select('school_id').eq('id', a.id).single()).data!.school_id
    schoolB = (await ownerB.from('profiles').select('school_id').eq('id', b.id).single()).data!.school_id
  })

  beforeEach(resetRegistry)

  it('publish dispatches sync consumers and marks the row dispatched', async () => {
    const token = crypto.randomUUID()
    const seen: string[] = []
    subscribe('SchoolCreated', async (e) => {
      if ((e.payload as { token?: string }).token === token) seen.push(e.id)
    })

    await systemEventEngine().publish({
      type: 'SchoolCreated',
      schoolId: null,
      payload: { token },
      actorId: null,
    })
    expect(seen).toHaveLength(1)

    // Already dispatched → the drain must not re-run this event.
    await systemEventEngine().drainOutbox()
    expect(seen).toHaveLength(1)
  })

  it('drainOutbox processes rows enqueued directly (async path)', async () => {
    const token = crypto.randomUUID()
    const seen: string[] = []
    subscribe('SmsDelivered', async (e) => {
      if ((e.payload as { token?: string }).token === token) seen.push(e.id)
    })

    // Enqueue undispatched via the raw RPC (no TS sync dispatch).
    const { data: id, error } = await anonClient().rpc('publish_domain_event', {
      p_type: 'SmsDelivered',
      p_school_id: null,
      p_payload: { token },
      p_actor_id: null,
      job_secret: SECRET,
    })
    expect(error).toBeNull()

    const { processed } = await systemEventEngine().drainOutbox()
    expect(processed).toBeGreaterThanOrEqual(1)
    expect(seen).toContain(id)
  })

  it('rejects publishing for a tenant the caller does not own', async () => {
    const { error } = await owner.rpc('publish_domain_event', {
      p_type: 'FeatureEnabled',
      p_school_id: schoolB,
      p_payload: {},
      p_actor_id: null,
    })
    expect(error).not.toBeNull()
  })

  it('allows a member to publish for their own tenant', async () => {
    const { error } = await owner.rpc('publish_domain_event', {
      p_type: 'FeatureEnabled',
      p_school_id: schoolA,
      p_payload: {},
      p_actor_id: null,
    })
    expect(error).toBeNull()
  })

  it('rejects a session caller attributing an event to another actor', async () => {
    const { error } = await owner.rpc('publish_domain_event', {
      p_type: 'FeatureEnabled',
      p_school_id: schoolA,
      p_payload: {},
      p_actor_id: crypto.randomUUID(),
    })
    expect(error).not.toBeNull()
  })

  it('allows a session caller to attribute an event to itself', async () => {
    const { error } = await owner.rpc('publish_domain_event', {
      p_type: 'FeatureEnabled',
      p_school_id: schoolA,
      p_payload: {},
      p_actor_id: aId,
    })
    expect(error).toBeNull()
  })

  it('scopes event reads to the caller tenant (RLS)', async () => {
    const token = crypto.randomUUID()
    await systemEventEngine().publish({
      type: 'FeatureEnabled',
      schoolId: schoolA,
      payload: { token },
      actorId: null,
    })

    const aRows = (await owner.from('domain_events').select('payload').eq('school_id', schoolA)).data ?? []
    expect(aRows.some((r) => (r.payload as { token?: string }).token === token)).toBe(true)

    const bReadsA = (await ownerB.from('domain_events').select('id').eq('school_id', schoolA)).data ?? []
    expect(bReadsA).toHaveLength(0)
  })
})
