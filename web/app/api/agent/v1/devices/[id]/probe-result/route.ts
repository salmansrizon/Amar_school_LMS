import { agentCredential, agentDb, json, jsonError, readJsonObject, rpcError, unauthorized, UUID } from '@/lib/agent-auth'

// POST /api/agent/v1/devices/{id}/probe-result (Baseline §22.1). Bearer
// credential; body {info, capabilities, credentialConfigured}: the driver's
// normalized DeviceInfo and DeviceCapabilities and whether a communication key
// is configured on the Agent PC (yes/no only — never the key). The machine must
// be this Agent's (report_attendance_device_probe, migration 0265). Returns the
// serial check: verified | serial_mismatch | no_serial.

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const credential = agentCredential(request)
  if (!credential) return unauthorized()
  const { id } = await ctx.params
  if (!UUID.test(id)) return jsonError(404, 'not found')
  const read = await readJsonObject(request, 32 * 1024)
  if ('response' in read) return read.response
  const { info, capabilities, credentialConfigured } = read.body
  const isObject = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v)
  if (!isObject(info) || !isObject(capabilities) || typeof credentialConfigured !== 'boolean') {
    return jsonError(400, 'invalid request')
  }
  const { data, error } = await agentDb().rpc('report_attendance_device_probe', {
    credential,
    machine_id: id,
    info,
    capabilities,
    credential_configured: credentialConfigured,
  })
  if (error) return rpcError(error)
  return json({ serial: data })
}
