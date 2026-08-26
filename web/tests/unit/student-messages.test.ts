import { describe, it, expect } from 'vitest'
import { groupByTopic, validateQuestion, answeredCount, type InboxMessage } from '@/lib/student/messages'

const msg = (over: Partial<InboxMessage> & { id: string; topic_key: string }): InboxMessage => ({
  student_id: 's',
  publication_id: null,
  subject_id: 'subj',
  subject: 'Q',
  body: 'body',
  status: 'unread',
  reply_body: null,
  replied_at: null,
  created_at: '2026-08-01T00:00:00Z',
  student_name: 'Nusrat',
  class_name: 'Nine',
  section: 'A',
  roll_number: 7,
  topic_label: over.topic_key,
  publication_kind: null,
  ...over,
})

describe('groupByTopic', () => {
  it('gathers questions under the post they were asked about', () => {
    const groups = groupByTopic([
      msg({ id: '1', topic_key: 'task-a' }),
      msg({ id: '2', topic_key: 'task-a' }),
      msg({ id: '3', topic_key: 'maths' }),
    ])
    expect(groups.map((g) => g.key).sort()).toEqual(['maths', 'task-a'])
    expect(groups.find((g) => g.key === 'task-a')!.messages).toHaveLength(2)
  })

  it('floats the topic with the most unanswered questions to the top', () => {
    // The task half the class is stuck on is what the teacher should open next.
    const groups = groupByTopic([
      msg({ id: '1', topic_key: 'quiet', status: 'answered' }),
      msg({ id: '2', topic_key: 'busy' }),
      msg({ id: '3', topic_key: 'busy' }),
    ])
    expect(groups[0].key).toBe('busy')
    expect(groups[0].unanswered).toBe(2)
  })

  it('labels a post-anchored group differently from a subject one', () => {
    const groups = groupByTopic([
      msg({ id: '1', topic_key: 'p1', publication_id: 'p1' }),
      msg({ id: '2', topic_key: 'subj' }),
    ])
    expect(groups.find((g) => g.key === 'p1')!.kind).toBe('post')
    expect(groups.find((g) => g.key === 'subj')!.kind).toBe('subject')
  })

  it('orders messages within a topic newest first', () => {
    const groups = groupByTopic([
      msg({ id: 'old', topic_key: 't', created_at: '2026-01-01T00:00:00Z' }),
      msg({ id: 'new', topic_key: 't', created_at: '2026-09-01T00:00:00Z' }),
    ])
    expect(groups[0].messages.map((m) => m.id)).toEqual(['new', 'old'])
  })
})

describe('validateQuestion', () => {
  const ok = { subject: 'About Q4', body: 'I do not understand', publicationId: 'p1' }

  it('accepts a question anchored to a post', () => {
    expect(validateQuestion(ok)).toBeNull()
  })

  it('accepts a question anchored to a subject', () => {
    expect(validateQuestion({ ...ok, publicationId: null, subjectId: 'maths' })).toBeNull()
  })

  it('refuses one anchored to neither — the inbox would have nowhere to file it', () => {
    expect(validateQuestion({ ...ok, publicationId: null, subjectId: null })).toBe('anchorRequired')
  })

  it('refuses empty text', () => {
    expect(validateQuestion({ ...ok, subject: '   ' })).toBe('subjectRequired')
    expect(validateQuestion({ ...ok, body: '' })).toBe('bodyRequired')
  })
})

describe('answeredCount', () => {
  it('counts replies waiting to be read', () => {
    expect(
      answeredCount([
        msg({ id: '1', topic_key: 't', status: 'answered' }),
        msg({ id: '2', topic_key: 't', status: 'unread' }),
      ]),
    ).toBe(1)
  })
})
