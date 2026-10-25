import { agentCredential, agentDb, json, jsonError, readJsonObject, rpcError, unauthorized, UUID } from '@/lib/agent-auth'

// POST /api/agent/v1/devices/{id}/credential-status (Baseline §22.1). Bearer
// credential; body {credentialConfigured}: whether the operator has set a
// communication key for this machine on the Agent PC. Yes/no only — the key
// itself never leaves the Agent PC.

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const credential = agentCredential(request)
  if (!credential) return unauthorized()
  const { id } = await ctx.params
  if (!UUID.test(id)) return jsonError(404, 'not found')
  const read = await readJsonObject(request, 1024)
  if ('response' in read) return read.response
  const { credentialConfigured, ...rest } = read.body
  if (typeof credentialConfigured !== 'boolean' || Object.keys(rest).length > 0) return jsonError(400, 'invalid request')
  const { error } = await agentDb().rpc('report_attendance_device_credential_status', {
    credential,
    machine_id: id,
    credential_configured: credentialConfigured,
  })
  if (error) return rpcError(error)
  return json({ ok: true })
}
