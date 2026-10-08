import { describe, expect, it } from 'vitest'
import {
  buildConversations,
  hasNewReply,
  threadSiblings,
  NEW_REPLY_DAYS,
  type ThreadRow,
} from '@/lib/student/question-threads'
import { QUESTION_BODY_MAX, validateQuestion } from '@/lib/student/messages'
import { isMissingRelationError } from '@/lib/student/questions-source'

// #703 items 5.2, 5.4, 5.5, 5.6: thread links, further replies, new-reply
// marks and the body limit. The title convention itself is covered by
// question-threads.test.ts and must keep passing unchanged.

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
const NOW = new Date('2026-10-07T12:00:00Z')

describe('thread_id grouping (5.4)', () => {
  it('two new originals with the same title and anchor stay separate', () => {
    const list = buildConversations([row('a', { thread_id: 'a' }), row('b', { thread_id: 'b' })])
    expect(list).toHaveLength(2)
  })
  it('a follow-up joins its original even with a different title', () => {
    const list = buildConversations([
      row('a', { thread_id: 'a' }),
      row('b', { thread_id: 'a', subject: 'Something else', created_at: '2026-10-02T10:00:00Z' }),
    ])
    expect(list).toHaveLength(1)
    expect(list[0].rows.map((r) => r.id)).toEqual(['a', 'b'])
  })
  it('a new original does not merge into an old row with the same title', () => {
    expect(buildConversations([row('old'), row('new', { thread_id: 'new' })])).toHaveLength(2)
  })
  it('a follow-up to an old original joins the old title group', () => {
    const list = buildConversations([
      row('old1'),
      row('old2', { created_at: '2026-10-02T10:00:00Z' }),
      row('f', { thread_id: 'old1', created_at: '2026-10-03T10:00:00Z' }),
    ])
    expect(list).toHaveLength(1)
    expect(list[0].rows.map((r) => r.id)).toEqual(['old1', 'old2', 'f'])
  })
  it('a follow-up whose original is not in the list forms its own group', () => {
    expect(buildConversations([row('f', { thread_id: 'gone' }), row('g', { thread_id: 'gone' })])).toHaveLength(1)
  })
  it('rows without thread_id behave exactly as before', () => {
    expect(buildConversations([row('a'), row('b', { thread_id: null })])).toHaveLength(1)
  })
})

describe('further replies (5.6)', () => {
  it('follow the first reply, in time order', () => {
    const [c] = buildConversations(
      [row('a', { status: 'answered', reply_body: 'first', replied_at: '2026-10-02T09:00:00Z' })],
      [
        { id: 'r2', message_id: 'a', body: 'third', created_at: '2026-10-04T09:00:00Z' },
        { id: 'r1', message_id: 'a', body: 'second', created_at: '2026-10-03T09:00:00Z' },
      ],
    )
    expect(c.steps.map((s) => (s.kind === 'waiting' ? 'waiting' : s.body))).toEqual(['body a', 'first', 'second', 'third'])
    expect(c.lastActivity).toBe('2026-10-04T09:00:00Z')
    expect(c.repliedRowIds).toEqual(['a'])
  })
})

describe('new reply (5.2)', () => {
  const replied = '2026-10-06T09:00:00Z'
  it('hasNewReply', () => {
    expect(hasNewReply(null, undefined, NOW)).toBe(false)
    expect(hasNewReply('nonsense', undefined, NOW)).toBe(false)
    expect(hasNewReply(replied, undefined, NOW)).toBe(true)
    expect(hasNewReply(replied, '2026-10-05T09:00:00Z', NOW)).toBe(true)
    expect(hasNewReply(replied, '2026-10-06T10:00:00Z', NOW)).toBe(false)
    const old = new Date(NOW.getTime() - (NEW_REPLY_DAYS + 1) * 86_400_000).toISOString()
    expect(hasNewReply(old, undefined, NOW)).toBe(false)
  })
  const rows = [row('a', { status: 'answered', reply_body: 'r', replied_at: replied })]
  it('unknown seen marks flag nothing', () => {
    expect(buildConversations(rows, [], null, NOW)[0].newReply).toBe(false)
  })
  it('an unseen reply is new; opening it clears the mark', () => {
    expect(buildConversations(rows, [], new Map(), NOW)[0].newReply).toBe(true)
    expect(buildConversations(rows, [], new Map([['a', '2026-10-06T10:00:00Z']]), NOW)[0].newReply).toBe(false)
  })
  it('a further reply after the last visit is new again', () => {
    const extra = [{ id: 'r1', message_id: 'a', body: 'more', created_at: '2026-10-07T08:00:00Z' }]
    expect(buildConversations(rows, extra, new Map([['a', '2026-10-06T10:00:00Z']]), NOW)[0].newReply).toBe(true)
  })
})

describe('threadSiblings (teacher side, 5.4)', () => {
  const m = (id: string, student_id: string, created_at: string) => ({ id, student_id, created_at })
  const messages = [m('b', 's1', '2026-10-02'), m('a', 's1', '2026-10-01'), m('c', 's2', '2026-10-03'), m('d', 's1', '2026-10-04')]
  it('returns the other messages of the thread, oldest first', () => {
    const threadOf = new Map([['a', 'a'], ['b', 'a'], ['d', 'd']])
    expect(threadSiblings(messages, threadOf, 'b').map((x) => x.id)).toEqual(['a'])
    expect(threadSiblings(messages, threadOf, 'a').map((x) => x.id)).toEqual(['b'])
  })
  it('a follow-up to an old original (no thread_id on the original) still finds it', () => {
    expect(threadSiblings(messages, new Map([['b', 'a']]), 'b').map((x) => x.id)).toEqual(['a'])
  })
  it('no thread ids, an unknown id, or another student: no siblings', () => {
    expect(threadSiblings(messages, new Map(), 'a')).toEqual([])
    expect(threadSiblings(messages, new Map(), 'zzz')).toEqual([])
    expect(threadSiblings(messages, new Map([['c', 'a']]), 'a')).toEqual([])
  })
})

describe('body limit (5.5)', () => {
  const base = { subject: 's', subjectId: 'x' }
  it('accepts the limit and refuses one more', () => {
    expect(validateQuestion({ ...base, body: 'a'.repeat(QUESTION_BODY_MAX) })).toBeNull()
    expect(validateQuestion({ ...base, body: 'a'.repeat(QUESTION_BODY_MAX + 1) })).toBe('bodyTooLong')
  })
  it('counts the trimmed text, as it is stored', () => {
    expect(validateQuestion({ ...base, body: `  ${'a'.repeat(QUESTION_BODY_MAX)}  ` })).toBeNull()
  })
})

describe('isMissingRelationError', () => {
  it('recognises a missing table and nothing else', () => {
    expect(isMissingRelationError({ code: 'PGRST205' })).toBe(true)
    expect(isMissingRelationError({ code: '42P01' })).toBe(true)
    expect(isMissingRelationError({ message: 'relation "public.student_message_replies" does not exist' })).toBe(true)
    expect(isMissingRelationError({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(isMissingRelationError(null)).toBe(false)
  })
})
