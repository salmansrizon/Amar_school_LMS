import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { recordAudit } from '@/lib/engines/audit/engine'
import { registerAuditConsumers } from '@/lib/engines/audit/consumers'
import { systemEventEngine } from '@/lib/engines/events/engine'
import type { AuditEntry } from '@/lib/engines/audit'

// Audit Engine (map #258, #261) against live Supabase: explicit record, tenant
// RLS scoping, immutability, dedupe idempotency, actor-spoof guard, and
// event-driven auto-audit.
describe('Audit Engine (#261)', () => {
  let owner: SupabaseClient
  let ownerB: SupabaseClient
  let schoolA: string

  const entry = (over: Partial<AuditEntry>): AuditEntry => ({
    actorId: null,
    schoolId: schoolA,
    entityType: 'audit_test',
    entityId: crypto.randomUUID(),
    action: 'configure',
    before: null,
    after: null,
    ip: null,
    requestId: null,
    ...over,
  })

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    const a = (await owner.auth.getUser()).data.user!
    schoolA = (await owner.from('profiles').select('school_id').eq('id', a.id).single()).data!.school_id
    registerAuditConsumers()
  })

  it('records an explicit entry readable only within the tenant', async () => {
    const e = entry({ after: { v: 1 } })
    await recordAudit(owner, e)
    const mine = (await owner.from('audit_log').select('after').eq('entity_id', e.entityId)).data ?? []
    expect(mine).toHaveLength(1)
    const others = (await ownerB.from('audit_log').select('id').eq('entity_id', e.entityId)).data ?? []
    expect(others).toHaveLength(0)
  })

  it('is immutable — update and delete are no-ops', async () => {
    const e = entry({ action: 'create' })
    await recordAudit(owner, e)
    await owner.from('audit_log').update({ action: 'delete' }).eq('entity_id', e.entityId)
    const row = (await owner.from('audit_log').select('action').eq('entity_id', e.entityId).single()).data
    expect(row!.action).toBe('create')
    await owner.from('audit_log').delete().eq('entity_id', e.entityId)
    const still = (await owner.from('audit_log').select('id').eq('entity_id', e.entityId)).data ?? []
    expect(still).toHaveLength(1)
  })

  it('dedupes repeated writes with the same key', async () => {
    const e = entry({ action: 'create' })
    const key = crypto.randomUUID()
    await recordAudit(owner, e, { dedupeKey: key })
    await recordAudit(owner, e, { dedupeKey: key })
    const rows = (await owner.from('audit_log').select('id').eq('entity_id', e.entityId)).data ?? []
    expect(rows).toHaveLength(1)
  })

  it('rejects attributing an entry to another actor', async () => {
    await expect(recordAudit(owner, entry({ actorId: crypto.randomUUID(), action: 'create' }))).rejects.toThrow()
  })

  it('auto-audits domain events end-to-end', async () => {
    const token = crypto.randomUUID()
    await systemEventEngine().publish({
      type: 'FeatureEnabled',
      schoolId: schoolA,
      payload: { token },
      actorId: null,
    })
    const rows =
      (
        await owner
          .from('audit_log')
          .select('after')
          .eq('entity_type', 'domain_event')
          .eq('school_id', schoolA)
          .order('created_at', { ascending: false })
          .limit(25)
      ).data ?? []
    expect(rows.some((r) => (r.after as { payload?: { token?: string } })?.payload?.token === token)).toBe(true)
  })
})
