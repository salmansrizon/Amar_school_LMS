import { describe, it, expect, vi, beforeEach } from 'vitest'

// The reconcile cron route drains attendance_reconcile_dates instead of
// reconciling one global date; ?date= only enqueues (migration 0215).

const rpc = vi.fn()
vi.mock('@/lib/cron/job', () => ({
  isCronAuthorized: (r: Request) => r.headers.get('authorization') === 'Bearer ok',
  cronClient: () => ({ rpc }),
  reconcileSecret: () => 'job-secret',
}))

const { GET } = await import('@/app/api/attendance/reconcile/route')

const call = (query = '', auth = 'Bearer ok') =>
  GET(new Request(`https://x.test/api/attendance/reconcile${query}`, { headers: { authorization: auth } }))

const drained = (claimed: number) => ({
  data: { claimed, done: claimed, skipped: 0, repended: 0, failed: 0, upserted: claimed },
  error: null,
})

describe('GET /api/attendance/reconcile', () => {
  beforeEach(() => rpc.mockReset())

  it('rejects a request without the cron secret', async () => {
    const res = await call('', 'Bearer nope')
    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('drains the queue and never calls the global-date reconcile', async () => {
    rpc.mockResolvedValueOnce(drained(3))
    const res = await call()
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('drain_attendance_reconcile_queue', { job_secret: 'job-secret', max_pairs: 200 })
    expect(rpc.mock.calls.some(([name]) => name === 'reconcile_attendance')).toBe(false)
    expect((await res.json()).drained).toMatchObject({ claimed: 3, done: 3, upserted: 3 })
  })

  it('keeps draining while a call claims a full batch, then stops', async () => {
    rpc.mockResolvedValueOnce(drained(200)).mockResolvedValueOnce(drained(200)).mockResolvedValueOnce(drained(7))
    const res = await call()
    expect(rpc).toHaveBeenCalledTimes(3)
    expect((await res.json()).drained.claimed).toBe(407)
  })

  it('stops after a bounded number of calls', async () => {
    rpc.mockResolvedValue(drained(200))
    await call()
    expect(rpc).toHaveBeenCalledTimes(10)
  })

  it('?date= only enqueues that day (all Schools)', async () => {
    rpc.mockResolvedValueOnce({ data: 4, error: null })
    const res = await call('?date=2026-07-01')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('enqueue_attendance_reconcile_dates', {
      job_secret: 'job-secret',
      target_date: '2026-07-01',
      target_school: null,
    })
    expect(await res.json()).toEqual({ date: '2026-07-01', school: null, enqueued: 4 })
  })

  it('?date=&school= enqueues one School', async () => {
    rpc.mockResolvedValueOnce({ data: 1, error: null })
    const school = '11111111-2222-3333-4444-555555555555'
    await call(`?date=2026-07-01&school=${school}`)
    expect(rpc).toHaveBeenCalledWith('enqueue_attendance_reconcile_dates', {
      job_secret: 'job-secret',
      target_date: '2026-07-01',
      target_school: school,
    })
  })

  it('rejects malformed parameters without calling the database', async () => {
    expect((await call('?date=07/01/2026')).status).toBe(400)
    expect((await call('?school=11111111-2222-3333-4444-555555555555')).status).toBe(400)
    expect((await call('?date=2026-07-01&school=nope')).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reports a database error', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const res = await call()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('boom')
  })
})
