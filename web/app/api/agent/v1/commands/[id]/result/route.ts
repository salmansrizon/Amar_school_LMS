import { agentCredential, agentDb, json, jsonError, optionalString, readJsonObject, rpcError, unauthorized, UUID } from '@/lib/agent-auth'

// POST /api/agent/v1/commands/{id}/result (Baseline §16). Bearer credential;
// body {claimToken, status, result?, errorClass?, errorDetail?}. Accepted once
// per (command, claim token); a repeat of the same outcome is
// already_completed; anything from an old claim is stale (complete_machine_command,
// migration 0221) — all three are 200 with the outcome in `ack`.

const ERROR_CLASSES = new Set([
  'unreachable', 'authFailed', 'timeout', 'busy', 'notSupported', 'capacityFull', 'invalidData', 'vendorError', 'driverUnavailable',
])

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const credential = agentCredential(request)
  if (!credential) return unauthorized()
  const { id } = await ctx.params
  if (!UUID.test(id)) return jsonError(404, 'not found')
  const read = await readJsonObject(request, 70 * 1024)
  if ('response' in read) return read.response
  const b = read.body
  const errorDetail = optionalString(b.errorDetail, 2000)
  const result = b.result ?? null
  if (
    typeof b.claimToken !== 'string' || !UUID.test(b.claimToken) ||
    (b.status !== 'succeeded' && b.status !== 'failed') ||
    (result !== null && (typeof result !== 'object' || Array.isArray(result))) ||
    (b.errorClass !== undefined && b.errorClass !== null && (typeof b.errorClass !== 'string' || !ERROR_CLASSES.has(b.errorClass))) ||
    (b.status === 'failed' && typeof b.errorClass !== 'string') ||
    errorDetail === null
  ) {
    return jsonError(400, 'invalid request')
  }
  const { data, error } = await agentDb().rpc('complete_machine_command', {
    credential,
    command_id: id,
    claim_token: b.claimToken,
    status: b.status,
    result,
    error_class: (b.errorClass as string | undefined) ?? null,
    error_detail: errorDetail ?? null,
  })
  if (error) return rpcError(error)
  return json({ ack: data })
}
