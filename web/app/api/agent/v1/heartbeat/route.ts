import { agentCredential, agentDb, json, jsonError, optionalString, readJsonObject, rpcError, unauthorized } from '@/lib/agent-auth'

// POST /api/agent/v1/heartbeat (Baseline §19, §22.1). Bearer credential; body
// {health, agentVersion?, osInfo?, hostname?}. health is the Agent's normalized
// AgentHealthReport (no keys, no credential). Returns the config version so the
// Agent knows when to fetch /config again.

export async function POST(request: Request) {
  const credential = agentCredential(request)
  if (!credential) return unauthorized()
  const read = await readJsonObject(request, 64 * 1024)
  if ('response' in read) return read.response
  const b = read.body
  const health = b.health ?? {}
  const agentVersion = optionalString(b.agentVersion, 64)
  const osInfo = optionalString(b.osInfo, 255)
  const hostname = optionalString(b.hostname, 255)
  if (!health || typeof health !== 'object' || Array.isArray(health) || agentVersion === null || osInfo === null || hostname === null) {
    return jsonError(400, 'invalid request')
  }
  const { data, error } = await agentDb().rpc('attendance_agent_heartbeat', {
    credential,
    health,
    agent_version: agentVersion ?? null,
    os_info: osInfo ?? null,
    hostname: hostname ?? null,
  })
  if (error) return rpcError(error)
  const row = Array.isArray(data) ? data[0] : null
  if (!row) return jsonError(500, 'internal error')
  return json({ agentId: row.agent_id, serverTime: row.server_time, configVersion: row.config_version })
}
