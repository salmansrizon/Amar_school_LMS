import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { systemEventEngine } from '@/lib/engines/events/engine'
import { registerNotificationConsumers } from '@/lib/engines/notification/consumers'

// Engine wiring (#271): the Notification engine consumes InvoicePaid and delivers
// an in-app notice to the school owner. Published synchronously so the consumer
// runs in-process (the payment_confirm → InvoicePaid emission is covered by
// invoicing.test).
describe('InvoicePaid → owner notification (event-driven)', () => {
  let owner: SupabaseClient
  let schoolA: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    const a = (await owner.auth.getUser()).data.user!
    schoolA = (await owner.from('profiles').select('school_id').eq('id', a.id).single()).data!.school_id
    registerNotificationConsumers()
  })

  it('notifies the school owner in-app', async () => {
    const number = `INV-WIRE-${crypto.randomUUID()}`
    await systemEventEngine().publish({
      type: 'InvoicePaid',
      schoolId: schoolA,
      payload: { number },
      actorId: null,
    })
    const rows = (await owner
      .from('notifications')
      .select('body, title')
      .order('created_at', { ascending: false })
      .limit(20)).data ?? []
    expect(rows.some((r) => r.body.includes(number))).toBe(true)
  })
})

// #271 / #267 cutover: the expiry sweep publishes SubscriptionExpiringSoon and
// the Notification engine delivers the owner an in-app expiry notice.
describe('SubscriptionExpiringSoon → owner notification (event-driven)', () => {
  let owner: SupabaseClient
  let schoolA: string
  let ownerId: string

  beforeAll(async () => {
    owner = await signedIn('owner-a@test.local')
    ownerId = (await owner.auth.getUser()).data.user!.id
    schoolA = (await owner.from('profiles').select('school_id').eq('id', ownerId).single()).data!.school_id
    registerNotificationConsumers()
  })

  it('drops an in-app notice naming the expiry date', async () => {
    const expiresOn = `20${Math.floor(Math.random() * 90) + 10}-12-31`
    await systemEventEngine().publish({
      type: 'SubscriptionExpiringSoon',
      schoolId: schoolA,
      payload: { schoolId: schoolA, ownerId, schoolName: 'Owner A School', expiresOn },
      actorId: null,
    })
    const rows = (await owner
      .from('notifications')
      .select('body')
      .order('created_at', { ascending: false })
      .limit(20)).data ?? []
    expect(rows.some((r) => r.body.includes(expiresOn))).toBe(true)
  })
})
