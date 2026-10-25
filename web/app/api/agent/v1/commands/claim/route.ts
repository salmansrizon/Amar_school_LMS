import { agentCredential, agentDb, json, jsonError, readJsonObject, rpcError, unauthorized } from '@/lib/agent-auth'

// POST /api/agent/v1/commands/claim (Baseline §12.7). Bearer credential; body
// {max} (1-100, default 10). Leases due commands of this Agent through
// claim_machine_commands (migration 0221).

export async function POST(request: Request) {
  const credential = agentCredential(request)
  if (!credential) return unauthorized()
  const read = await readJsonObject(request, 1024)
  if ('response' in read) return read.response
  const max = read.body.max ?? 10
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > 100) return jsonError(400, 'invalid request')
  const { data, error } = await agentDb().rpc('claim_machine_commands', { credential, max_commands: max })
  if (error) return rpcError(error)
  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[]
  return json({
    commands: rows.map((c) => ({
      id: c.id,
      claimToken: c.claim_token,
      machineId: c.machine_id,
      type: c.type,
      payload: c.payload,
      idempotencyKey: c.idempotency_key,
      priority: c.priority,
      attempt: c.attempts,
      maxAttempts: c.max_attempts,
      leaseExpiresAt: c.lease_expires_at,
    })),
  })
}
