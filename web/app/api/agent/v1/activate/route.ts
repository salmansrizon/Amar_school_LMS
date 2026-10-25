import { agentDb, json, jsonError, optionalString, readJsonObject, rpcError, UUID } from '@/lib/agent-auth'

// POST /api/agent/v1/activate (Baseline §18.1, §22.1). Auth is the one-time
// activation code in the body plus the Agent's locally generated identity:
// installId, a stable credential prefix and credentialVerifier =
// sha256(secret). The raw secret is never sent and nothing returned is a
// credential. Retry-safe: the same installId + prefix + verifier + code returns
// the existing Agent (activate_attendance_agent, migration 0265).

const PREFIX = /^[A-Za-z0-9]{8,32}$/
const VERIFIER = /^[0-9a-f]{64}$/
const CODE = /^[0-9A-Za-z\s-]{12,24}$/

export async function POST(request: Request) {
  const read = await readJsonObject(request, 4096)
  if ('response' in read) return read.response
  const b = read.body
  const hostname = optionalString(b.hostname, 255)
  const osInfo = optionalString(b.osInfo, 255)
  const agentVersion = optionalString(b.agentVersion, 64)
  if (
    typeof b.code !== 'string' || !CODE.test(b.code) ||
    typeof b.installId !== 'string' || !UUID.test(b.installId) ||
    typeof b.credentialPrefix !== 'string' || !PREFIX.test(b.credentialPrefix) ||
    typeof b.credentialVerifier !== 'string' || !VERIFIER.test(b.credentialVerifier) ||
    hostname === null || osInfo === null || agentVersion === null
  ) {
    return jsonError(400, 'invalid request')
  }

  const { data, error } = await agentDb().rpc('activate_attendance_agent', {
    code: b.code,
    install_id: b.installId,
    credential_prefix: b.credentialPrefix,
    credential_verifier: b.credentialVerifier,
    hostname: hostname ?? null,
    os_info: osInfo ?? null,
    agent_version: agentVersion ?? null,
  })
  if (error) return rpcError(error)
  const row = Array.isArray(data) ? data[0] : null
  if (!row) return jsonError(500, 'internal error')
  return json({ agentId: row.agent_id, school: { id: row.school_id, name: row.school_name } })
}
