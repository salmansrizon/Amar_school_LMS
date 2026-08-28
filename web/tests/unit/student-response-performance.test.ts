import { describe, it, expect } from 'vitest'
import {
  responseReport,
  median,
  withinRange,
  schoolWideOverall,
  visibleTeacherRows,
  OWNER_BUCKET,
  responseView,
  type MessageForStats,
} from '@/lib/student/response-performance'

const NOW = new Date('2026-08-26T12:00:00Z')
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000).toISOString()

const msg = (over: Partial<MessageForStats> & { id: string }): MessageForStats => ({
  created_at: hoursAgo(10),
  replied_at: null,
  // Follows replied_at unless a case deliberately sets them apart — the two
  // are one fact (isAnswered), and a fixture that lets them drift silently is
  // how the production defect got in.
  status: over.replied_at ? 'answered' : 'unread',
  teacherId: 't1',
  teacherName: 'Karim Sir',
  // Default: nobody recorded as replier, which is both an unanswered question
  // and every row answered before #511 shipped. Either way it falls back to the
  // Class Teacher, so the pre-#511 cases below still describe the old rule.
  repliedById: null,
  repliedByName: null,
  subject: over.id,
  ...over,
})

describe('who a question is accounted to (#511, ADR 0019)', () => {
  const answeredBySubjectTeacher = msg({
    id: 'physics',
    created_at: hoursAgo(10),
    replied_at: hoursAgo(8),
    teacherId: 't1',
    teacherName: 'Karim Sir',
    repliedById: 't2',
    repliedByName: 'Rahim Sir',
  })

  it('credits the answer to whoever replied, not to the class teacher', () => {
    const report = responseReport([answeredBySubjectTeacher], NOW)
    expect(report.perTeacher).toHaveLength(1)
    expect(report.perTeacher[0]).toMatchObject({
      teacherId: 't2',
      teacherName: 'Rahim Sir',
      answered: 1,
    })
  })

  it('leaves an unanswered question with the class teacher', () => {
    const report = responseReport([msg({ id: 'waiting' })], NOW)
    expect(report.perTeacher[0]).toMatchObject({ teacherId: 't1', unanswered: 1 })
  })

  it('moves a question out of the class teacher row once a colleague answers', () => {
    const before = responseReport([msg({ id: 'q', teacherId: 't1' })], NOW)
    const after = responseReport([answeredBySubjectTeacher], NOW)
    expect(before.perTeacher.map((r) => r.teacherId)).toEqual(['t1'])
    expect(after.perTeacher.map((r) => r.teacherId)).toEqual(['t2'])
  })

  it('gives the owner her own row rather than the unassigned bucket', () => {
    const report = responseReport(
      [
        msg({ id: 'a', replied_at: hoursAgo(1), repliedById: OWNER_BUCKET, repliedByName: null }),
        // A class with no teacher at all — the bucket the owner's row must not
        // be confused with.
        msg({ id: 'b', teacherId: null, teacherName: null }),
      ],
      NOW,
    )
    const ids = report.perTeacher.map((r) => r.teacherId)
    expect(ids).toContain(OWNER_BUCKET)
    expect(ids).toContain(null)
  })

  it('falls back to the class teacher for a row answered with no recorded replier', () => {
    const report = responseReport(
      [msg({ id: 'legacy', replied_at: hoursAgo(2), repliedById: null })],
      NOW,
    )
    expect(report.perTeacher[0]).toMatchObject({ teacherId: 't1', answered: 1 })
  })

  it('keeps each question in exactly one row', () => {
    const report = responseReport(
      [answeredBySubjectTeacher, msg({ id: 'waiting' }), msg({ id: 'other', teacherId: 't3', teacherName: 'Sultana Miss' })],
      NOW,
    )
    const summed = report.perTeacher.reduce((n, r) => n + r.received, 0)
    expect(summed).toBe(report.overall.received)
  })
})

describe('median', () => {
  it('takes the middle of an odd list', () => {
    expect(median([1, 5, 3])).toBe(3)
  })
  it('averages the middle pair of an even list', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
  it('is null for nothing', () => {
    expect(median([])).toBeNull()
  })
})

describe('responseReport', () => {
  it('counts received, answered and still waiting', () => {
    const report = responseReport(
      [
        msg({ id: 'a', created_at: hoursAgo(10), replied_at: hoursAgo(8) }),
        msg({ id: 'b', created_at: hoursAgo(5) }),
      ],
      NOW,
    )
    expect(report.overall).toMatchObject({ received: 2, answered: 1, unanswered: 1 })
  })

  it('measures reply time from question to reply, not to now', () => {
    const report = responseReport(
      [msg({ id: 'a', created_at: hoursAgo(10), replied_at: hoursAgo(8) })],
      NOW,
    )
    expect(report.overall.medianHours).toBe(2)
    expect(report.overall.slowestHours).toBe(2)
  })

  it('names the oldest question still waiting, and how long', () => {
    const report = responseReport(
      [
        msg({ id: 'recent', created_at: hoursAgo(2) }),
        msg({ id: 'stale', created_at: hoursAgo(72), subject: 'About chapter 4' }),
      ],
      NOW,
    )
    expect(report.overall.oldestWaiting).toEqual({ id: 'stale', subject: 'About chapter 4', hours: 72 })
  })

  it('has no oldest-waiting once everything is answered', () => {
    const report = responseReport(
      [msg({ id: 'a', created_at: hoursAgo(4), replied_at: hoursAgo(1) })],
      NOW,
    )
    expect(report.overall.oldestWaiting).toBeNull()
    expect(report.overall.unanswered).toBe(0)
  })

  it('reports null reply times when nothing has been answered — not zero', () => {
    const report = responseReport([msg({ id: 'a' })], NOW)
    expect(report.overall.medianHours).toBeNull()
    expect(report.overall.slowestHours).toBeNull()
  })

  it('splits per teacher and rolls the school up', () => {
    const report = responseReport(
      [
        msg({ id: 'a', teacherId: 't1', teacherName: 'Karim Sir' }),
        msg({ id: 'b', teacherId: 't2', teacherName: 'Ayesha Miss' }),
        msg({ id: 'c', teacherId: 't2', teacherName: 'Ayesha Miss' }),
      ],
      NOW,
    )
    expect(report.overall.received).toBe(3)
    expect(report.perTeacher.map((t) => t.received)).toEqual([2, 1])
  })

  it('orders teachers by name, never by any metric', () => {
    // Ordering people by response time is the leaderboard this must not be.
    const report = responseReport(
      [
        msg({ id: 'slow', teacherId: 'z', teacherName: 'Zaman Sir', created_at: hoursAgo(100) }),
        msg({ id: 'fast', teacherId: 'a', teacherName: 'Ayesha Miss', replied_at: hoursAgo(9) }),
      ],
      NOW,
    )
    expect(report.perTeacher.map((t) => t.teacherName)).toEqual(['Ayesha Miss', 'Zaman Sir'])
  })

  it('collects questions with no accountable teacher rather than dropping them', () => {
    // A class with no teacher assigned is a normal state (#435), and its
    // questions still need answering.
    const report = responseReport([msg({ id: 'a', teacherId: null, teacherName: null })], NOW)
    expect(report.perTeacher).toHaveLength(1)
    expect(report.perTeacher[0].teacherId).toBeNull()
    expect(report.overall.received).toBe(1)
  })
})

describe('withinRange', () => {
  const rows = [
    msg({ id: 'jan', created_at: '2026-01-15T00:00:00Z' }),
    msg({ id: 'jun', created_at: '2026-06-15T00:00:00Z' }),
  ]

  it('includes both ends of the window', () => {
    expect(withinRange(rows, '2026-01-15', '2026-01-15').map((r) => r.id)).toEqual(['jan'])
  })

  it('treats a missing bound as open', () => {
    expect(withinRange(rows, null, null)).toHaveLength(2)
    expect(withinRange(rows, '2026-02-01', null).map((r) => r.id)).toEqual(['jun'])
  })
})

// The two seams #509 pulled out of the page (ADR 0018): the school-wide Σ a
// teacher is allowed to see, and which per-teacher rows she is allowed to see.

describe('schoolWideOverall', () => {
  it('computes the Σ from timestamps alone', () => {
    // school_question_timings discloses nothing else — no student, no class, no
    // subject — which is what lets a teacher see it at all.
    const stats = schoolWideOverall(
      [
        { created_at: '2026-08-01T00:00:00Z', replied_at: '2026-08-01T04:00:00Z' },
        { created_at: '2026-08-01T00:00:00Z', replied_at: '2026-08-01T10:00:00Z' },
        { created_at: '2026-08-01T00:00:00Z', replied_at: null },
      ],
      new Date('2026-08-02T00:00:00Z'),
    )
    expect(stats.received).toBe(3)
    expect(stats.answered).toBe(2)
    expect(stats.unanswered).toBe(1)
    expect(stats.medianHours).toBe(7)
    expect(stats.slowestHours).toBe(10)
    expect(stats.oldestWaiting?.hours).toBe(24)
  })

  it('agrees with the Owner path on the same questions', () => {
    // One definition of "median". If these two ever diverge, a teacher and her
    // Owner are reading different numbers for the same school.
    const rows = [
      { created_at: '2026-08-01T00:00:00Z', replied_at: '2026-08-01T03:00:00Z' },
      { created_at: '2026-08-01T00:00:00Z', replied_at: '2026-08-01T09:00:00Z' },
    ]
    const viaOwner = responseReport(
      rows.map((r, i) => ({
        id: String(i),
        subject: '',
        ...r,
        status: r.replied_at ? ('answered' as const) : ('unread' as const),
        teacherId: null,
        teacherName: null,
        repliedById: null,
        repliedByName: null,
      })),
      new Date('2026-08-02T00:00:00Z'),
    ).overall
    expect(schoolWideOverall(rows, new Date('2026-08-02T00:00:00Z'))).toEqual(viaOwner)
  })

  it('reports an empty school without inventing a number', () => {
    const stats = schoolWideOverall([])
    expect(stats.received).toBe(0)
    expect(stats.medianHours).toBeNull()
    expect(stats.oldestWaiting).toBeNull()
  })
})

describe('visibleTeacherRows', () => {
  const report = responseReport(
    [
      { id: '1', subject: 'a', created_at: '2026-08-01T00:00:00Z', replied_at: null, status: 'unread' as const, teacherId: 'karim', teacherName: 'Karim', repliedById: null, repliedByName: null },
      { id: '2', subject: 'b', created_at: '2026-08-01T00:00:00Z', replied_at: null, status: 'unread' as const, teacherId: 'nusrat', teacherName: 'Nusrat', repliedById: null, repliedByName: null },
      { id: '3', subject: 'c', created_at: '2026-08-01T00:00:00Z', replied_at: null, status: 'unread' as const, teacherId: null, teacherName: null, repliedById: null, repliedByName: null },
    ],
    new Date('2026-08-02T00:00:00Z'),
  )

  it('gives the Owner the full per-teacher table', () => {
    expect(visibleTeacherRows(report, { isOwner: true, employeeId: null })).toHaveLength(3)
  })

  it('gives a teacher her own row and no colleague’s', () => {
    // The league table is exactly what #455 asked this not to become.
    const rows = visibleTeacherRows(report, { isOwner: false, employeeId: 'karim' })
    expect(rows.map((r) => r.teacherId)).toEqual(['karim'])
  })

  it('keeps the unassigned bucket with the Owner', () => {
    // A class with no Class Teacher belongs to nobody; surfacing it on some
    // arbitrary teacher's page would make her look accountable for it.
    const rows = visibleTeacherRows(report, { isOwner: false, employeeId: null })
    expect(rows).toEqual([])
  })
})

describe('responseView: the whole screen behind one interface', () => {
  // Everything below used to live in app/school/questions/response/page.tsx —
  // three hand-built Maps, a fallback, a date filter and two visibility rules,
  // none of which any test could reach. The page fetched rows and shaped them;
  // the tests entered one level lower, at responseReport(messages), which is
  // under the shaping rather than over it.
  const KARIM = 'emp-karim'
  const RAHIM = 'emp-rahim'
  const KARIM_LOGIN = 'login-karim'
  const RAHIM_LOGIN = 'login-rahim'
  const OWNER_LOGIN = 'login-owner'

  const sources = (over: Partial<Parameters<typeof responseView>[0]> = {}) => ({
    messages: [],
    classes: [
      { name: 'Six', section: 'A', class_teacher_id: KARIM },
      { name: 'Seven', section: null, class_teacher_id: null },
    ],
    employees: [
      { id: KARIM, full_name: 'Karim Sir' },
      { id: RAHIM, full_name: 'Rahim Sir' },
    ],
    repliers: [
      { profile_id: KARIM_LOGIN, employee_id: KARIM },
      { profile_id: RAHIM_LOGIN, employee_id: RAHIM },
    ],
    schoolTimings: null,
    ...over,
  })

  const inbox = (over: Record<string, unknown> & { id: string }) => ({
    subject: over.id,
    created_at: '2026-08-01T00:00:00Z',
    replied_at: null,
    replied_by: null,
    status: 'unread' as const,
    class_name: 'Six',
    section: 'A',
    ...over,
  })

  const AT = new Date('2026-08-02T00:00:00Z')
  const owner = { isOwner: true, employeeId: null, from: null, to: null }

  it('joins a question to its class teacher by name and section', () => {
    const view = responseView(
      sources({ messages: [inbox({ id: 'a' })] }),
      owner,
      AT,
    )
    expect(view.perTeacher).toHaveLength(1)
    expect(view.perTeacher[0]).toMatchObject({ teacherId: KARIM, teacherName: 'Karim Sir', unanswered: 1 })
  })

  it('treats a null section and an empty one as the same class', () => {
    const view = responseView(
      sources({ messages: [inbox({ id: 'a', class_name: 'Seven', section: null })] }),
      owner,
      AT,
    )
    // Class Seven has no class teacher — the unassigned bucket, not a crash.
    expect(view.perTeacher[0]).toMatchObject({ teacherId: null, unanswered: 1 })
  })

  it('maps a reply from a login to the employee who made it', () => {
    const view = responseView(
      sources({
        messages: [inbox({ id: 'a', status: 'answered', replied_at: '2026-08-01T06:00:00Z', replied_by: RAHIM_LOGIN })],
      }),
      owner,
      AT,
    )
    expect(view.perTeacher[0]).toMatchObject({ teacherId: RAHIM, teacherName: 'Rahim Sir', answered: 1 })
  })

  it('puts a reply from a login with no employee row in the owner bucket', () => {
    // The School Owner has no `employees` row. Every other actor who may reply
    // holds a class attachment, which is read off one — so this is the only
    // remaining case, not a guess (ADR 0018/0019).
    const view = responseView(
      sources({
        messages: [inbox({ id: 'a', status: 'answered', replied_at: '2026-08-01T06:00:00Z', replied_by: OWNER_LOGIN })],
      }),
      owner,
      AT,
    )
    expect(view.perTeacher[0]).toMatchObject({ teacherId: OWNER_BUCKET, answered: 1 })
  })

  it('keeps a question with no recorded replier on the class teacher', () => {
    const view = responseView(
      sources({ messages: [inbox({ id: 'a', status: 'answered', replied_at: '2026-08-01T06:00:00Z' })] }),
      owner,
      AT,
    )
    expect(view.perTeacher[0]).toMatchObject({ teacherId: KARIM, answered: 1 })
  })

  it('applies the date window before anything else', () => {
    const view = responseView(
      sources({
        messages: [
          inbox({ id: 'in', created_at: '2026-08-01T00:00:00Z' }),
          inbox({ id: 'out', created_at: '2026-07-01T00:00:00Z' }),
        ],
      }),
      { ...owner, from: '2026-08-01', to: '2026-08-31' },
      AT,
    )
    expect(view.overall.received).toBe(1)
  })

  it('gives a teacher her own row and the school-wide sum from the RPC', () => {
    // Her own SELECT stops at her classes (0152), so rolling her rows up would
    // print her own total under the school's label.
    const view = responseView(
      sources({
        messages: [inbox({ id: 'mine' })],
        schoolTimings: [
          { created_at: '2026-08-01T00:00:00Z', replied_at: '2026-08-01T03:00:00Z' },
          { created_at: '2026-08-01T00:00:00Z', replied_at: null },
        ],
      }),
      { isOwner: false, employeeId: KARIM, from: null, to: null },
      AT,
    )
    expect(view.perTeacher.map((r) => r.teacherId)).toEqual([KARIM])
    expect(view.overall.received).toBe(2)
  })

  it('rolls the owner up from her own rows, with no RPC', () => {
    const view = responseView(
      sources({ messages: [inbox({ id: 'a' }), inbox({ id: 'b' })] }),
      owner,
      AT,
    )
    expect(view.overall.received).toBe(2)
  })

  it('hides the unassigned and owner buckets from a teacher', () => {
    const view = responseView(
      sources({
        messages: [
          inbox({ id: 'mine' }),
          inbox({ id: 'nobody', class_name: 'Seven', section: null }),
          inbox({ id: 'owners', status: 'answered', replied_at: '2026-08-01T06:00:00Z', replied_by: OWNER_LOGIN }),
        ],
        schoolTimings: [],
      }),
      { isOwner: false, employeeId: KARIM, from: null, to: null },
      AT,
    )
    expect(view.perTeacher.map((r) => r.teacherId)).toEqual([KARIM])
  })

  it('counts what the caller can see separately from the school-wide sum', () => {
    // A teacher with none of her own questions must still get the "nothing
    // here" line, even when the school has plenty.
    const view = responseView(
      sources({
        messages: [],
        schoolTimings: [{ created_at: '2026-08-01T00:00:00Z', replied_at: null }],
      }),
      { isOwner: false, employeeId: KARIM, from: null, to: null },
      AT,
    )
    expect(view.overall.received).toBe(1)
    expect(view.receivedInScope).toBe(0)
  })

  it('survives every source coming back null', () => {
    // Supabase hands back null on error, and this screen must not be the thing
    // that turns a failed fetch into a crash.
    const view = responseView(
      { messages: null, classes: null, employees: null, repliers: null, schoolTimings: null },
      owner,
      AT,
    )
    expect(view.overall.received).toBe(0)
    expect(view.perTeacher).toEqual([])
  })
})
