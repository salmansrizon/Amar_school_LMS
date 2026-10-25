import { agentCredential, agentDb, json, rpcError, unauthorized } from '@/lib/agent-auth'

// GET /api/agent/v1/config (Baseline §12.3, §22.1). Bearer credential. The
// enabled, non-archived machines assigned to this Agent, plus the ids of its
// archived machines (so it can wipe their local keys). No device
// communication key exists in the cloud to include.

export async function GET(request: Request) {
  const credential = agentCredential(request)
  if (!credential) return unauthorized()
  const { data, error } = await agentDb().rpc('get_attendance_agent_config', { credential })
  if (error) return rpcError(error)
  return json(data)
}
