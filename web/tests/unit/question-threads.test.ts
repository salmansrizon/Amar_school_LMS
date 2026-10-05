import { describe, expect, it } from 'vitest'
import { buildConversations, findConversation, type ThreadRow } from '@/lib/student/question-threads'

const row = (id: string, o: Partial<ThreadRow> = {}): ThreadRow => ({
  id,
  subject: 'Algebra help',
  body: `body ${id}`,
  status: 'unread',
  reply_body: null,
  replied_at: null,
  created_at: '2026-10-01T10:00:00Z',
  publication_id: null,
  subject_id: 's1',
  ...o,
})

describe('buildConversations', () => {
  it('groups rows with the same anchor and normalised title', () => {
    const list = buildConversations([
      row('b', { subject: '  algebra   HELP ', created_at: '2026-10-02T10:00:00Z' }),
      row('a'),
    ])
    expect(list).toHaveLength(1)
    expect(list[0].rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(list[0].id).toBe('a')
    expect(list[0].title).toBe('Algebra help')
  })
  it('keeps the same title under different anchors separate', () => {
    expect(buildConversations([row('a'), row('b', { subject_id: 's2' })])).toHaveLength(2)
    expect(buildConversations([row('a', { publication_id: 'p1' }), row('b', { publication_id: 'p2' })])).toHaveLength(2)
    // a publication anchor beats the subject anchor
    expect(buildConversations([row('a', { publication_id: 'p1' }), row('b')])).toHaveLength(2)
  })
  it('orders the timeline and ends with a waiting step when unanswered', () => {
    const [c] = buildConversations([
      row('b', { created_at: '2026-10-03T10:00:00Z' }),
      row('a', { status: 'answered', reply_body: 'r', replied_at: '2026-10-02T09:00:00Z' }),
    ])
    expect(c.steps.map((s) => s.kind)).toEqual(['asked', 'replied', 'asked', 'waiting'])
    expect(c.answered).toBe(false)
    expect(c.lastActivity).toBe('2026-10-03T10:00:00Z')
  })
  it('status follows the latest row; last activity includes replies', () => {
    const [c] = buildConversations([
      row('a'),
      row('b', { created_at: '2026-10-02T10:00:00Z', status: 'answered', reply_body: 'r', replied_at: '2026-10-04T10:00:00Z' }),
    ])
    expect(c.answered).toBe(true)
    expect(c.steps.at(-1)?.kind).toBe('replied')
    expect(c.lastActivity).toBe('2026-10-04T10:00:00Z')
  })
  it('handles a single-row conversation and sorts conversations by activity', () => {
    const list = buildConversations([
      row('old', { subject: 'Old', created_at: '2026-09-01T00:00:00Z' }),
      row('new', { subject: 'New', created_at: '2026-10-01T00:00:00Z' }),
    ])
    expect(list.map((c) => c.id)).toEqual(['new', 'old'])
    expect(list[0].steps.map((s) => s.kind)).toEqual(['asked', 'waiting'])
  })
  it('finds a conversation by a follow-up row id', () => {
    const list = buildConversations([row('a'), row('b', { created_at: '2026-10-02T10:00:00Z' })])
    expect(findConversation(list, 'b')?.id).toBe('a')
    expect(findConversation(list, 'zz')).toBeNull()
  })
})
