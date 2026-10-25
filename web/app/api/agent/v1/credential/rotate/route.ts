import { agentCredential, agentDb, json, jsonError, readJsonObject, rpcError, unauthorized } from '@/lib/agent-auth'

// POST /api/agent/v1/credential/rotate (Baseline §18.1). Bearer = the current
// credential. Body {newVerifier} only: the prefix never changes, so a body
// carrying one is refused. The old secret stays valid until previousValidUntil.

const VERIFIER = /^[0-9a-f]{64}$/

export async function POST(request: Request) {
  const credential = agentCredential(request)
  if (!credential) return unauthorized()
  const read = await readJsonObject(request, 1024)
  if ('response' in read) return read.response
  const { newVerifier, ...rest } = read.body
  if (typeof newVerifier !== 'string' || !VERIFIER.test(newVerifier) || Object.keys(rest).length > 0) {
    return jsonError(400, 'invalid request')
  }
  const { data, error } = await agentDb().rpc('rotate_attendance_agent_credential', {
    credential,
    new_verifier: newVerifier,
  })
  if (error) return rpcError(error)
  return json({ ok: true, previousValidUntil: data ?? null })
}
