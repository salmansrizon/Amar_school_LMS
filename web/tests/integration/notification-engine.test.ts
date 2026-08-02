import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { createNotificationEngine, markRead, pushInApp } from '@/lib/engines/notification/engine'

// Notification Engine (map #258, #267) against live Supabase: in-app push,
// recipient-scoped RLS, mark-read, template-driven send, authority.
describe('Notification Engine (#267)', () => {
  let superClient: SupabaseClient
  let owner: SupabaseClient
  let ownerB: SupabaseClient
  let ownerId: string
  let schoolA: string

  beforeAll(async () => {
    superClient = await signedIn('super@test.local')
    owner = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    const a = (await owner.auth.getUser()).data.user!
    ownerId = a.id
    schoolA = (await owner.from('profiles').select('school_id').eq('id', a.id).single()).data!.school_id
  })

  it('pushes an in-app notification the recipient can read (and others cannot)', async () => {
    const token = crypto.randomUUID()
    const id = await pushInApp(superClient, { recipientId: ownerId, schoolId: schoolA, title: 'Hi', body: token })
    const mine = (await owner.from('notifications').select('body').eq('id', id).single()).data!
    expect(mine.body).toBe(token)
    const theirs = (await ownerB.from('notifications').select('id').eq('id', id)).data ?? []
    expect(theirs).toHaveLength(0)
  })

  it('lets the recipient mark it read', async () => {
    const id = await pushInApp(superClient, { recipientId: ownerId, schoolId: schoolA, title: 'x', body: 'y' })
    await markRead(owner, id)
    const row = (await owner.from('notifications').select('read_at').eq('id', id).single()).data!
    expect(row.read_at).not.toBeNull()
  })

  it('send() renders a template and delivers in-app', async () => {
    const token = crypto.randomUUID()
    await createNotificationEngine(superClient).send({
      schoolId: schoolA,
      recipientId: ownerId,
      templateKey: 'invoice_generated',
      data: { number: token, total: 2000 },
    })
    const rows = (await owner.from('notifications').select('body').eq('recipient_id', ownerId).order('created_at', { ascending: false }).limit(10)).data ?? []
    expect(rows.some((r) => r.body.includes(token))).toBe(true)
  })

  it('blocks non-super/non-system pushes', async () => {
    await expect(
      pushInApp(owner, { recipientId: ownerId, schoolId: schoolA, title: 'x', body: 'y' }),
    ).rejects.toThrow()
  })
})
