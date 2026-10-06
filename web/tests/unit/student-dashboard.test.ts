import { describe, it, expect } from 'vitest'
import {
  schoolDay,
  isTaskHandled,
  taskUrgency,
  dashboardTaskCounts,
  isFeeOverdue,
  feeStatus,
  examUrgency,
  formatClock,
  attendanceBand,
  rawTotal,
  latestResult,
  buildStudentAlerts,
  buildStudentUpcoming,
  MAX_STUDENT_ALERTS,
  type StudentAlertInput,
} from '@/lib/student/dashboard'
import type { StudentTask } from '@/lib/student/tasks'
import type { FeeRecord } from '@/lib/student/fees'
import type { ExamRoutineRow } from '@/lib/student/exam-schedule'
import type { ResultRow } from '@/lib/student/results'

const TODAY = '2026-10-04'
const NOW = new Date('2026-10-04T06:00:00Z') // noon in Dhaka

const task = (over: Partial<StudentTask> = {}): StudentTask => ({
  id: 't1',
  title: 'Task',
  content: null,
  due_at: null,
  created_at: '2026-09-01T00:00:00Z',
  completed_at: null,
  ...over,
})
const fee = (month: number, due: number, year = 2026): FeeRecord => ({
  id: `${year}-${month}`,
  month,
  year,
  pay_amount: 0,
  fine_amount: 0,
  due_amount: due,
  payment_method: null,
  updated_at: '2026-10-01T00:00:00Z',
})
const paper = (date: string, over: Partial<ExamRoutineRow> = {}): ExamRoutineRow => ({
  exam_id: 'e1',
  exam_name: 'Half Yearly',
  exam_year: 2026,
  exam_date: date,
  day_of_week: 0,
  start_time: '10:00:00',
  end_time: '12:00:00',
  subject_name: 'Math',
  room_name: 'Room 2',
  ...over,
})
const result = (over: Partial<ResultRow> = {}): ResultRow => ({
  exam_id: 'e1',
  exam_name: 'UAT Exam',
  exam_year: 2026,
  results_published_at: '2026-09-01T00:00:00Z',
  grading_scheme_id: null,
  subject_id: 's1',
  subject_name: 'Physics',
  subject_theory_total: 100,
  subject_mcq_total: 0,
  subject_practical_total: 0,
  theory_obtained: 72,
  mcq_obtained: null,
  practical_obtained: null,
  obtained_marks: 72,
  ...over,
})
const input = (over: Partial<StudentAlertInput> = {}): StudentAlertInput => ({
  today: TODAY,
  now: NOW,
  tasks: [],
  fees: [],
  exams: [],
  notices: [],
  unread: new Set(),
  leaves: [],
  messages: [],
  attendancePercent: null,
  ...over,
})

describe('schoolDay', () => {
  it('computes the day in Asia/Dhaka around midnight UTC', () => {
    // 18:00 UTC is midnight in Dhaka (UTC+6): the school day rolls over there.
    expect(schoolDay('2026-10-03T17:59:59Z')).toBe('2026-10-03')
    expect(schoolDay('2026-10-03T18:00:00Z')).toBe('2026-10-04')
    expect(schoolDay('2026-10-04T00:30:00Z')).toBe('2026-10-04')
    expect(schoolDay(new Date('2026-10-04T17:59:00Z'))).toBe('2026-10-04')
  })
  it('returns an empty string for junk', () => {
    expect(schoolDay('not a date')).toBe('')
  })
})

describe('taskUrgency and dashboardTaskCounts', () => {
  it('due today is due soon, yesterday is overdue, by school day', () => {
    // 2026-10-03T18:30Z is 00:30 on the 4th in Dhaka: due today, although the
    // instant is already past `now` in some readings and "yesterday" in UTC.
    expect(taskUrgency(task({ due_at: '2026-10-03T18:30:00Z' }), TODAY)).toBe('dueSoon')
    // 17:30Z on the 3rd is 23:30 on the 3rd in Dhaka: yesterday.
    expect(taskUrgency(task({ due_at: '2026-10-03T17:30:00Z' }), TODAY)).toBe('overdue')
  })
  it('due within 2 days is due soon, day 3 is later, undated is later', () => {
    expect(taskUrgency(task({ due_at: '2026-10-06T10:00:00Z' }), TODAY)).toBe('dueSoon')
    expect(taskUrgency(task({ due_at: '2026-10-07T10:00:00Z' }), TODAY)).toBe('later')
    expect(taskUrgency(task(), TODAY)).toBe('later')
  })
  it('a handed-in or ticked task is not pending', () => {
    const late = '2026-09-20T10:00:00Z'
    expect(isTaskHandled(task({ submitted: true }))).toBe(true)
    expect(isTaskHandled(task({ completed_at: late }))).toBe(true)
    expect(isTaskHandled(task())).toBe(false)
    expect(taskUrgency(task({ due_at: late, submitted: true }), TODAY)).toBe('done')
    const counts = dashboardTaskCounts(
      [task({ id: 'a', due_at: late, submitted: true }), task({ id: 'b', due_at: late, completed_at: late })],
      TODAY,
    )
    expect(counts).toMatchObject({ overdue: 0, dueSoon: 0, pending: 0, oldestOverdue: null, nextDue: null })
  })
  it('counts the piles and names the earliest of each', () => {
    const counts = dashboardTaskCounts(
      [
        task({ id: 'new-overdue', due_at: '2026-10-02T10:00:00Z' }),
        task({ id: 'old-overdue', due_at: '2026-09-28T10:00:00Z' }),
        task({ id: 'soon', due_at: '2026-10-05T10:00:00Z' }),
        task({ id: 'later', due_at: '2026-10-20T10:00:00Z' }),
      ],
      TODAY,
    )
    expect(counts.overdue).toBe(2)
    expect(counts.dueSoon).toBe(1)
    expect(counts.pending).toBe(3)
    expect(counts.oldestOverdue?.id).toBe('old-overdue')
    expect(counts.nextDue?.id).toBe('soon')
  })
})

describe('feeStatus', () => {
  it('a past month due is alert, the current month only is sun, zero is mint, no rows muted', () => {
    expect(feeStatus([fee(9, 600), fee(10, 600)], TODAY)).toMatchObject({ tone: 'alert', due: 1200, monthsDue: 2 })
    expect(feeStatus([fee(9, 0), fee(10, 600)], TODAY)).toMatchObject({ tone: 'sun', due: 600, monthsDue: 1 })
    expect(feeStatus([fee(9, 0)], TODAY)).toMatchObject({ tone: 'mint', due: 0, monthsDue: 0, oldest: null })
    expect(feeStatus([], TODAY).tone).toBe('muted')
  })
  it('names the oldest unpaid month and handles a year boundary', () => {
    expect(feeStatus([fee(10, 1), fee(12, 5, 2025), fee(9, 1)], TODAY).oldest).toMatchObject({ month: 12, year: 2025 })
    expect(isFeeOverdue(fee(12, 5, 2025), '2026-01-15')).toBe(true)
    expect(isFeeOverdue(fee(1, 5, 2026), '2026-01-15')).toBe(false)
    expect(isFeeOverdue(fee(12, 0, 2025), '2026-01-15')).toBe(false)
  })
})

describe('examUrgency and formatClock', () => {
  it('today, 1 to 3 days, later, past', () => {
    expect(examUrgency('2026-10-04', TODAY)).toBe('today')
    expect(examUrgency('2026-10-05', TODAY)).toBe('soon')
    expect(examUrgency('2026-10-07', TODAY)).toBe('soon')
    expect(examUrgency('2026-10-08', TODAY)).toBe('later')
    expect(examUrgency('2026-10-03', TODAY)).toBe('past')
  })
  it('formats a Postgres time in en and bn', () => {
    expect(formatClock('10:30:00', 'en')).toBe('10:30 AM')
    expect(formatClock('14:05', 'en')).toBe('2:05 PM')
    expect(formatClock('00:00:00', 'en')).toBe('12:00 AM')
    expect(formatClock('10:30:00', 'bn')).toMatch(/^১০:৩০ /)
    expect(formatClock('10:30:00', 'bn')).not.toMatch(/[0-9]/)
  })
  it('returns an empty string for null or junk', () => {
    expect(formatClock(null, 'en')).toBe('')
    expect(formatClock('soon', 'bn')).toBe('')
    expect(formatClock('25:00', 'en')).toBe('')
  })
})

describe('attendanceBand', () => {
  it('has edges at 90 and 75', () => {
    expect(attendanceBand(100)).toBe('mint')
    expect(attendanceBand(90)).toBe('mint')
    expect(attendanceBand(89)).toBe('sun')
    expect(attendanceBand(75)).toBe('sun')
    expect(attendanceBand(74)).toBe('alert')
    expect(attendanceBand(0)).toBe('alert')
    expect(attendanceBand(null)).toBe('muted')
  })
})

describe('latestResult', () => {
  it('is none without rows', () => {
    expect(latestResult([])).toEqual({ state: 'none' })
  })
  it('totals the raw marks of the newest published exam', () => {
    const rows = [
      result(),
      result({ subject_id: 's2', subject_name: 'Math', subject_mcq_total: 30, subject_theory_total: 70, obtained_marks: 55 }),
      result({ exam_id: 'old', exam_name: 'Old', exam_year: 2027, results_published_at: '2026-01-01T00:00:00Z', obtained_marks: 10 }),
    ]
    const latest = latestResult(rows, [{ id: 's1' }, { id: 's2' }])
    expect(latest).toEqual({
      state: 'ok', examId: 'e1', examName: 'UAT Exam', examYear: 2026, obtained: 127, full: 200, subjects: 2,
    })
    expect(rawTotal(rows)).toEqual({ obtained: 137, full: 300 })
  })
  it('is incomplete when a class subject has no mark', () => {
    expect(latestResult([result()], [{ id: 's1' }, { id: 's2' }])).toMatchObject({ state: 'incomplete', obtained: 72, full: 100 })
  })
  it('never carries a grade, a GPA or a pass flag', () => {
    expect(Object.keys(latestResult([result()])).sort()).toEqual(
      ['examId', 'examName', 'examYear', 'full', 'obtained', 'state', 'subjects'],
    )
  })
})

describe('buildStudentAlerts', () => {
  it('is empty when nothing is pending', () => {
    expect(buildStudentAlerts(input())).toEqual([])
    expect(buildStudentAlerts(input({ fees: [fee(9, 0)], attendancePercent: 95 }))).toEqual([])
  })

  it('puts alert before sun before sky, then the earliest date', () => {
    const alerts = buildStudentAlerts(
      input({
        tasks: [
          task({ id: 'o', due_at: '2026-10-01T10:00:00Z' }),
          task({ id: 'd', due_at: '2026-10-05T10:00:00Z' }),
        ],
        fees: [fee(9, 600)],
        exams: [paper(TODAY)],
        leaves: [{ from_day: '2026-10-10', to_day: '2026-10-11', status: 'pending', created_at: '2026-10-03T05:00:00Z' }],
        notices: [{ id: 'n1', title: 'Sports day', importance: 'normal', created_at: '2026-10-03T05:00:00Z' }],
        unread: new Set(['n1']),
      }),
    )
    expect(alerts.map((a) => [a.tone, a.kind])).toEqual([
      ['alert', 'feeOverdue'], // 2026-09-01
      ['alert', 'tasksOverdue'], // 2026-10-01
      ['alert', 'examToday'], // 2026-10-04
      ['sun', 'tasksDue'],
      ['sky', 'leavePending'],
      ['sky', 'newNotices'], // undated, last
    ])
  })

  it('caps the strip at six rows and keeps the most urgent', () => {
    const alerts = buildStudentAlerts(
      input({
        tasks: [task({ id: 'o', due_at: '2026-10-01T10:00:00Z' }), task({ id: 'd', due_at: '2026-10-05T10:00:00Z' })],
        fees: [fee(9, 600)],
        exams: [paper(TODAY)],
        notices: [
          { id: 'u', title: 'Closed tomorrow', importance: 'urgent', created_at: '2026-10-04T02:00:00Z' },
          { id: 'n', title: 'Sports day', importance: 'normal', created_at: '2026-10-03T05:00:00Z' },
        ],
        unread: new Set(['u', 'n']),
        leaves: [
          { from_day: '2026-10-10', to_day: '2026-10-11', status: 'pending', created_at: '2026-10-03T05:00:00Z' },
          { from_day: '2026-10-08', to_day: '2026-10-08', status: 'rejected', created_at: '2026-10-02T05:00:00Z' },
        ],
        attendancePercent: 60,
      }),
    )
    expect(alerts).toHaveLength(MAX_STUDENT_ALERTS)
    expect(alerts.slice(0, 4).every((a) => a.tone === 'alert')).toBe(true)
    expect(alerts.some((a) => a.tone === 'sky')).toBe(false)
  })

  it('fee: past month is an alert, current month only is sun, zero is none', () => {
    expect(buildStudentAlerts(input({ fees: [fee(9, 600), fee(10, 600)] }))).toMatchObject([
      { kind: 'feeOverdue', tone: 'alert', amount: 1200, month: 9, year: 2026, href: '/student/fees' },
    ])
    expect(buildStudentAlerts(input({ fees: [fee(10, 600)] }))).toMatchObject([
      { kind: 'feeDue', tone: 'sun', amount: 600, month: 10 },
    ])
    expect(buildStudentAlerts(input({ fees: [fee(10, 0)] }))).toEqual([])
  })

  it('exam: today is an alert, 1 to 3 days is sun, 4 days is nothing', () => {
    expect(buildStudentAlerts(input({ exams: [paper('2026-10-09'), paper(TODAY)] }))).toMatchObject([
      { kind: 'examToday', tone: 'alert', paper: { exam_date: TODAY } },
    ])
    expect(buildStudentAlerts(input({ exams: [paper('2026-10-07')] }))).toMatchObject([{ kind: 'examSoon', tone: 'sun' }])
    expect(buildStudentAlerts(input({ exams: [paper('2026-10-08')] }))).toEqual([])
    expect(buildStudentAlerts(input({ exams: [paper('2026-10-03')] }))).toEqual([])
  })

  it('a handed-in task raises no alert', () => {
    expect(buildStudentAlerts(input({ tasks: [task({ due_at: '2026-10-01T10:00:00Z', submitted: true })] }))).toEqual([])
  })

  it('names the oldest overdue task and counts the rest', () => {
    const [alert] = buildStudentAlerts(
      input({
        tasks: [
          task({ id: 'b', title: 'Newer', due_at: '2026-10-02T10:00:00Z' }),
          task({ id: 'a', title: 'Oldest', due_at: '2026-09-25T10:00:00Z' }),
        ],
      }),
    )
    expect(alert).toMatchObject({ kind: 'tasksOverdue', count: 2, task: { title: 'Oldest' }, date: '2026-09-25' })
  })

  it('rejected leave is reported only within 7 days', () => {
    const leave = (created_at: string) => ({ from_day: '2026-10-10', to_day: '2026-10-11', status: 'rejected', created_at })
    expect(buildStudentAlerts(input({ leaves: [leave('2026-09-27T06:00:00Z')] }))).toMatchObject([
      { kind: 'leaveRejected', tone: 'sun', href: '/student/leave' },
    ])
    expect(buildStudentAlerts(input({ leaves: [leave('2026-09-26T06:00:00Z')] }))).toEqual([])
    // An approved request is not news for the strip.
    expect(buildStudentAlerts(input({ leaves: [{ ...leave('2026-10-03T06:00:00Z'), status: 'approved' }] }))).toEqual([])
  })

  it('rejected-leave window counts from decided_at when present', () => {
    const base = { from_day: '2026-10-10', to_day: '2026-10-11', status: 'rejected', created_at: '2026-09-14T06:00:00Z' }
    // Requested 20 days ago, decided 2 days ago: still news.
    expect(
      buildStudentAlerts(input({ leaves: [{ ...base, decided_at: '2026-10-02T06:00:00Z' }] })),
    ).toMatchObject([{ kind: 'leaveRejected' }])
    // Requested recently, decided 8 days ago: stale.
    expect(
      buildStudentAlerts(
        input({ leaves: [{ ...base, created_at: '2026-10-03T06:00:00Z', decided_at: '2026-09-26T06:00:00Z' }] }),
      ),
    ).toEqual([])
    // No decided_at: created_at as before.
    expect(buildStudentAlerts(input({ leaves: [{ ...base, decided_at: null }] }))).toEqual([])
  })

  it('attendance below 75 is sun, 75 and unrecorded are nothing', () => {
    expect(buildStudentAlerts(input({ attendancePercent: 74 }))).toMatchObject([
      { kind: 'attendanceLow', tone: 'sun', percent: 74 },
    ])
    expect(buildStudentAlerts(input({ attendancePercent: 75 }))).toEqual([])
    expect(buildStudentAlerts(input({ attendancePercent: null }))).toEqual([])
  })

  it('a question waits 24 h before it is reported, and isAnswered settles it', () => {
    const q = (created_at: string, over = {}) => ({
      subject: 'Algebra', status: 'unread' as const, replied_at: null, created_at, ...over,
    })
    // NOW is 2026-10-04T06:00Z.
    expect(buildStudentAlerts(input({ messages: [q('2026-10-03T06:00:00Z')] }))).toMatchObject([
      { kind: 'questionWaiting', tone: 'sky', count: 1, message: { subject: 'Algebra' } },
    ])
    expect(buildStudentAlerts(input({ messages: [q('2026-10-03T07:00:00Z')] }))).toEqual([])
    expect(buildStudentAlerts(input({ messages: [q('2026-09-01T00:00:00Z', { status: 'answered' })] }))).toEqual([])
    // A reply timestamp alone is enough (isAnswered reads either column).
    expect(
      buildStudentAlerts(input({ messages: [q('2026-09-01T00:00:00Z', { status: 'read', replied_at: '2026-09-02T00:00:00Z' })] })),
    ).toEqual([])
  })

  it('an unread urgent notice is an alert linking to the notice; the rest are counted', () => {
    const alerts = buildStudentAlerts(
      input({
        notices: [
          { id: 'u1', title: 'Closed', importance: 'urgent', created_at: '2026-10-04T02:00:00Z' },
          { id: 'u2', title: 'Read already', importance: 'urgent', created_at: '2026-10-04T03:00:00Z' },
          { id: 'n1', title: 'A', importance: 'normal', created_at: '2026-10-01T02:00:00Z' },
          { id: 'n2', title: 'B', importance: 'important', created_at: '2026-10-02T02:00:00Z' },
        ],
        unread: new Set(['u1', 'n1', 'n2']),
      }),
    )
    expect(alerts).toMatchObject([
      { kind: 'urgentNotice', tone: 'alert', href: '/student/notices/u1', count: 1 },
      { kind: 'newNotices', tone: 'sky', href: '/student/notices', count: 2 },
    ])
  })
})

describe('buildStudentUpcoming', () => {
  const opts = { lang: 'en' as const, holidayTitle: 'Holiday', dueDetail: 'Due' }
  it('merges exams, holidays and homework deadlines, soonest first', () => {
    const items = buildStudentUpcoming(
      {
        exams: [paper('2026-10-08'), paper('2026-10-01')],
        offDays: [{ day: '2026-10-06', label: null }, { day: '2026-10-02', label: 'Past' }],
        tasks: [
          task({ id: 'x', title: 'Essay', due_at: '2026-10-05T10:00:00Z' }),
          task({ id: 'done', due_at: '2026-10-05T10:00:00Z', submitted: true }),
          task({ id: 'late', due_at: '2026-10-01T10:00:00Z' }),
          task({ id: 'undated' }),
        ],
      },
      TODAY,
      opts,
    )
    expect(items).toEqual([
      { kind: 'class', title: 'Essay', date: '2026-10-05', detail: 'Due', href: '/student/tasks/x' },
      { kind: 'holiday', title: 'Holiday', date: '2026-10-06' },
      { kind: 'exam', title: 'Math', date: '2026-10-08', detail: 'Half Yearly · 10:00 AM · Room 2', href: '/student/exams' },
    ])
  })
  it('respects the limit and is empty without sources', () => {
    const exams = Array.from({ length: 9 }, (_, i) => paper(`2026-10-${String(10 + i).padStart(2, '0')}`))
    expect(buildStudentUpcoming({ exams, offDays: [], tasks: [] }, TODAY, opts)).toHaveLength(6)
    expect(buildStudentUpcoming({ exams, offDays: [], tasks: [] }, TODAY, { ...opts, limit: 2 })).toHaveLength(2)
    expect(buildStudentUpcoming({ exams: [], offDays: [], tasks: [] }, TODAY, opts)).toEqual([])
  })
})
