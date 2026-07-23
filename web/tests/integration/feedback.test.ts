import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'

// Seam: feedback_messages + satisfaction_ratings schema, school RLS, and the
// unread/read/answered state machine (issue #38, migration 0037).

describe('Feedback module (issue #38): inbox tenancy + ratings aggregation', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let admin: SupabaseClient
  let messageId: string

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    admin = await signedIn('super@test.local')
    await ownerA.from('feedback_messages').delete().eq('subject', 'Feedback Test Subject')
    await ownerA.from('satisfaction_ratings').delete().eq('sender_name', 'Feedback Test Rater')
  })

  afterAll(async () => {
    await admin.from('feedback_messages').delete().eq('subject', 'Feedback Test Subject')
    await admin.from('satisfaction_ratings').delete().eq('sender_name', 'Feedback Test Rater')
  })

  it('a feedback message logged by School A is scoped to School A and starts unread', async () => {
    const { data, error } = await ownerA
      .from('feedback_messages')
      .insert({
        sender_name: 'Rahima Begum',
        sender_role: 'Guardian',
        subject: 'Feedback Test Subject',
        body: 'Question about admission process',
      })
      .select('id, school_id, status')
      .single()
    expect(error).toBeNull()
    expect(data!.school_id).not.toBeNull() // school_id auto-filled from the owner's school
    expect(data!.status).toBe('unread')
    messageId = data!.id
  })

  it("another School's Owner cannot see School A's feedback message", async () => {
    const { data } = await ownerB.from('feedback_messages').select('id').eq('id', messageId)
    expect(data).toEqual([])
  })

  it('opening the message (mark read) transitions unread -> read', async () => {
    const { error } = await ownerA
      .from('feedback_messages')
      .update({ status: 'read', read_at: new Date().toISOString() })
      .eq('id', messageId)
    expect(error).toBeNull()
    const { data } = await ownerA.from('feedback_messages').select('status').eq('id', messageId).single()
    expect(data!.status).toBe('read')
  })

  it('replying transitions to answered and stores the reply', async () => {
    const { error } = await ownerA
      .from('feedback_messages')
      .update({
        status: 'answered',
        reply_body: 'Thanks for reaching out — admission opens next week.',
        replied_at: new Date().toISOString(),
      })
      .eq('id', messageId)
    expect(error).toBeNull()
    const { data } = await ownerA
      .from('feedback_messages')
      .select('status, reply_body')
      .eq('id', messageId)
      .single()
    expect(data!.status).toBe('answered')
    expect(data!.reply_body).toContain('admission')
  })

  it('an invalid status value is rejected', async () => {
    const { error } = await ownerA.from('feedback_messages').update({ status: 'archived' }).eq('id', messageId)
    expect(error).not.toBeNull()
  })

  it('a satisfaction rating is scoped to the submitting School (institute scope)', async () => {
    const { data, error } = await ownerA
      .from('satisfaction_ratings')
      .insert({ overall_rating: 5, category_teaching: 4, sender_name: 'Feedback Test Rater' })
      .select('id, school_id, scope')
      .single()
    expect(error).toBeNull()
    expect(data!.scope).toBe('institute')
    expect(data!.school_id).not.toBeNull()
  })

  it("another School's Owner cannot see School A's ratings", async () => {
    const { data } = await ownerB
      .from('satisfaction_ratings')
      .select('id')
      .eq('sender_name', 'Feedback Test Rater')
    expect(data).toEqual([])
  })

  it('overall_rating is constrained to 1-5', async () => {
    const { error } = await ownerA.from('satisfaction_ratings').insert({ overall_rating: 9 })
    expect(error).not.toBeNull()
  })

  it('an application-scope rating cannot carry a School Owner-defaulted school_id (scope_school_pairing)', async () => {
    // school_id defaults to app_current_school_id() (non-null for a school owner),
    // so pairing it with scope='application' must be rejected by the check constraint.
    const { error } = await ownerA.from('satisfaction_ratings').insert({ overall_rating: 4, scope: 'application' })
    expect(error).not.toBeNull()
  })
})
