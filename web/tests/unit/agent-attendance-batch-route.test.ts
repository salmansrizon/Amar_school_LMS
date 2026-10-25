import { describe, it, expect, vi, beforeEach } from 'vitest'

// POST /api/agent/v1/attendance/batch (Phase 8): the route only parses and
// forwards; ingest_agent_attendance_events (0268) decides everything else.

const rpc = vi.fn()
vi.mock('@/lib/agent-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agent-auth')>()),
  agentDb: () => ({ rpc }),
}))

const { POST } = await import('@/app/api/agent/v1/attendance/batch/route')

const CREDENTIAL = 'agt_0123456789abcdef_' + 'S'.repeat(43)
const BATCH = '6f1f6a9e-55a2-4a8e-9a43-3c1a43d0c6a1'
const event = { machineId: '11111111-2222-3333-4444-555555555555', eventKey: 'k', machineUserId: '1', deviceLocalTime: '2026-09-20T08:00:00', verifyMode: '3' }

const call = (body: unknown, auth: string | null = `Bearer ${CREDENTIAL}`) =>
  POST(new Request('http://localhost/api/agent/v1/attendance/batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))

describe('POST /api/agent/v1/attendance/batch', () => {
  beforeEach(() => rpc.mockReset())

  it('forwards the credential, batch id and events unchanged and returns the per-event answer', async () => {
    const answer = { accepted: [{ machineId: event.machineId, eventKey: 'k' }], duplicates: [], rejected: [] }
    rpc.mockResolvedValueOnce({ data: answer, error: null })
    const res = await call({ batchId: BATCH, events: [event] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(answer)
    expect(rpc).toHaveBeenCalledWith('ingest_agent_attendance_events', { credential: CREDENTIAL, batch_id: BATCH, events: [event] })
  })

  it('takes no School from the caller: unknown top-level fields are refused', async () => {
    expect((await call({ batchId: BATCH, events: [event], schoolId: '11111111-2222-3333-4444-555555555555' })).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a missing or malformed credential without calling the database', async () => {
    expect((await call({ batchId: BATCH, events: [event] }, null)).status).toBe(401)
    expect((await call({ batchId: BATCH, events: [event] }, 'Bearer nope')).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('validates the batch envelope: batch id, a non-empty array, at most 1000 events, valid JSON', async () => {
    expect((await call({ batchId: 'nope', events: [event] })).status).toBe(400)
    expect((await call({ batchId: BATCH, events: [] })).status).toBe(400)
    expect((await call({ batchId: BATCH, events: {} })).status).toBe(400)
    expect((await call({ batchId: BATCH, events: Array.from({ length: 1001 }, () => event) })).status).toBe(413)
    expect((await call('{not json')).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('a payload over 4 MiB with at most 1000 events is 413, never 500, and never reaches the database', async () => {
    const heavy = { ...event, raw: { blob: 'x'.repeat(15_000) } } // each event within the 16 KiB raw rule
    const events = Array.from({ length: 300 }, () => heavy) // ~4.5 MB in total, 300 events
    const res = await call({ batchId: BATCH, events })
    expect(res.status).toBe(413)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps database errors to fixed answers', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'invalid agent credential' } })
    expect((await call({ batchId: BATCH, events: [event] })).status).toBe(401)
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'invalid attendance batch' } })
    expect((await call({ batchId: BATCH, events: [event] })).status).toBe(413) // only the 4 MiB bound is left at that point
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'something internal' } })
    const res = await call({ batchId: BATCH, events: [event] })
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('something internal')
    rpc.mockResolvedValueOnce({ data: { accepted: [] }, error: null })
    expect((await call({ batchId: BATCH, events: [event] })).status).toBe(500)
  })
})
