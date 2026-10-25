import { agentCredential, agentDb, json, jsonError, readJsonObject, rpcError, unauthorized, UUID } from '@/lib/agent-auth'

// POST /api/agent/v1/attendance/batch (Machine Attendance Phase 8; Baseline
// §15, §22.1). Bearer credential; body {batchId, events:[…]} with 1-1000
// events, each naming its own machineId (an Agent batch may span the Agent's
// machines). Everything else — who the Agent and School are, machine
// ownership, the event key, tapped_at and attendance_date — is decided by
// ingest_agent_attendance_events (migration 0268) from the verified
// credential and the server's own data. Answers
// {accepted:[{machineId,eventKey}], duplicates:[…], rejected:[{machineId,eventKey,reason}]};
// a bad event is rejected on its own, never the whole batch.

export const MAX_EVENTS = 1000
const MAX_BYTES = 4 * 1024 * 1024

export async function POST(request: Request) {
  const credential = agentCredential(request)
  if (!credential) return unauthorized()
  const read = await readJsonObject(request, MAX_BYTES)
  if ('response' in read) return read.response
  const { batchId, events, ...rest } = read.body
  if (Object.keys(rest).length > 0 || typeof batchId !== 'string' || !UUID.test(batchId) || !Array.isArray(events) || events.length === 0) {
    return jsonError(400, 'invalid request')
  }
  if (events.length > MAX_EVENTS) return jsonError(413, 'too many events')
  const { data, error } = await agentDb().rpc('ingest_agent_attendance_events', { credential, batch_id: batchId, events })
  if (error) return rpcError(error)
  if (!data || typeof data !== 'object' || !Array.isArray(data.accepted) || !Array.isArray(data.duplicates) || !Array.isArray(data.rejected)) {
    return jsonError(500, 'internal error')
  }
  return json({ accepted: data.accepted, duplicates: data.duplicates, rejected: data.rejected })
}
