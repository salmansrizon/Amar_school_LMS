import { describe, it, expect } from 'vitest'
import { isAnswered, type AnswerableRecord } from '@/lib/student/messages'
import { groupByTopic, type InboxMessage } from '@/lib/student/messages'
import { responseReport, type MessageForStats } from '@/lib/student/response-performance'
import { waitingTone } from '@/lib/student/hub'

// "Answered" is ONE domain fact. Before this module it was spelled two ways —
// `status !== 'answered'` in the inbox and the rails, `!replied_at` in the
// response report — and nothing made the spellings agree. Every row in the live
// database disagreed, so উত্তরের অবস্থা reported "0 answered, 4 waiting" about
// four questions the inbox was showing as answered.
//
// These pin the one predicate, and pin each of the three readers to it.

const rec = (over: Partial<AnswerableRecord> = {}): AnswerableRecord => ({
  status: 'unread',
  replied_at: null,
  ...over,
})

describe('isAnswered', () => {
  it('is true when the row is marked answered, even with no reply timestamp', () => {
    // The state the live database was actually in. A reply happened; when it
    // happened was not recorded.
    expect(isAnswered(rec({ status: 'answered' }))).toBe(true)
  })

  it('is true when a reply timestamp exists, whatever the status says', () => {
    // Defensive on the other side: a timestamp is evidence of a reply.
    expect(isAnswered(rec({ status: 'read', replied_at: '2026-08-01T00:00:00Z' }))).toBe(true)
  })

  it('is false for a question nobody has replied to', () => {
    expect(isAnswered(rec({ status: 'unread' }))).toBe(false)
    expect(isAnswered(rec({ status: 'read' }))).toBe(false)
  })
})

describe('the three readers agree', () => {
  const answeredNoTimestamp = { status: 'answered' as const, replied_at: null }

  it('the inbox does not count it as waiting', () => {
    const base: InboxMessage = {
      id: '1', student_id: 's', publication_id: null, subject_id: 'x',
      subject: 'Q', body: 'b', reply_body: 'a', created_at: '2026-08-01T00:00:00Z',
      student_name: 'N', class_name: 'Nine', section: 'A', roll_number: 1,
      topic_label: 'x', topic_key: 'x', publication_kind: null,
      ...answeredNoTimestamp,
    }
    expect(groupByTopic([base])[0].unanswered).toBe(0)
  })

  it('the status rail settles it', () => {
    expect(
      waitingTone({ created_at: '2026-08-01T00:00:00Z', ...answeredNoTimestamp }, new Date('2026-09-01T00:00:00Z')),
    ).toBe('mint')
  })

  it('the response report counts it answered, not waiting', () => {
    // This is the assertion that was false in production.
    const rows: MessageForStats[] = [
      {
        id: '1', subject: 'Q', created_at: '2026-08-01T00:00:00Z',
        teacherId: 't', teacherName: 'Karim', ...answeredNoTimestamp,
      },
    ]
    const { overall } = responseReport(rows, new Date('2026-09-01T00:00:00Z'))
    expect(overall.answered).toBe(1)
    expect(overall.unanswered).toBe(0)
    expect(overall.oldestWaiting).toBeNull()
  })

  it('the response report does not invent a reply time it does not have', () => {
    // Counting it as answered is honest; timing it is not. A fabricated
    // replied_at would either flatter the median (created_at) or wreck it (now).
    const rows: MessageForStats[] = [
      { id: '1', subject: 'Q', created_at: '2026-08-01T00:00:00Z', teacherId: 't', teacherName: 'K', ...answeredNoTimestamp },
      { id: '2', subject: 'Q2', created_at: '2026-08-01T00:00:00Z', replied_at: '2026-08-01T06:00:00Z', status: 'answered', teacherId: 't', teacherName: 'K' },
    ]
    const { overall } = responseReport(rows, new Date('2026-09-01T00:00:00Z'))
    expect(overall.answered).toBe(2)
    // Median over the ONE reply whose duration is known — not 3h, which is what
    // averaging in a fabricated zero would give.
    expect(overall.medianHours).toBe(6)
  })
})
