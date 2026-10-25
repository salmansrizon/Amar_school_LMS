import type { SupabaseClient } from '@supabase/supabase-js'

// Attendance Agents, admin side (Machine Attendance Phase 6; ADR 0033,
// Baseline §18.1, §22.2). Every function takes the caller's own Supabase
// client: the definer RPCs (migration 0265) check the School and the
// Attendance grant themselves, and attendance_agents_safe / machine_commands
// are read under RLS. No hash, credential or device key is ever read here.

export interface AttendanceAgent {
  id: string
  name: string
  hostname: string | null
  status: 'active' | 'revoked'
  agent_version: string | null
  activated_at: string
  last_heartbeat_at: string | null
}

export async function listAgents(supabase: SupabaseClient): Promise<AttendanceAgent[]> {
  const { data } = await supabase
    .from('attendance_agents_safe')
    .select('id, name, hostname, status, agent_version, activated_at, last_heartbeat_at')
    .order('activated_at')
  return (data ?? []) as AttendanceAgent[]
}

/** A one-time activation code, shown once. Only its hash is stored. */
export async function createActivationCode(supabase: SupabaseClient): Promise<{ code: string; expiresAt: string } | { error: 'errSave' }> {
  const { data, error } = await supabase.rpc('create_attendance_agent_activation_code')
  const row = Array.isArray(data) ? data[0] : null
  if (error || !row) return { error: 'errSave' }
  return { code: row.code as string, expiresAt: row.expires_at as string }
}

export async function revokeAgent(supabase: SupabaseClient, agentId: string): Promise<{ error?: 'errNotFound' | 'errSave' }> {
  const { error } = await supabase.rpc('revoke_attendance_agent', { agent_id: agentId })
  if (!error) return {}
  return { error: error.code === 'P0002' ? 'errNotFound' : 'errSave' }
}

export type TestConnectionError = 'errNotFound' | 'errNoAgent' | 'errNotInService' | 'errSave'

/** Queues TEST_CONNECTION for a machine (an open one is reused). The browser
 *  never talks to the device: the Agent on the School's LAN does. */
export async function requestTestConnection(
  supabase: SupabaseClient,
  machineId: string,
): Promise<{ commandId: string } | { error: TestConnectionError }> {
  const { data, error } = await supabase.rpc('request_attendance_machine_test', { machine_id: machineId })
  if (!error && typeof data === 'string') return { commandId: data }
  if (error?.code === 'P0002') return { error: 'errNotFound' }
  if (error?.message.includes('no active agent')) return { error: 'errNoAgent' }
  if (error?.message.includes('not in service')) return { error: 'errNotInService' }
  return { error: 'errSave' }
}

export interface MachineCommandStatus {
  id: string
  machine_id: string | null
  status: 'pending' | 'claimed' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired'
  result: Record<string, unknown> | null
  error_class: string | null
  error_detail: string | null
  created_at: string
  completed_at: string | null
}

const COMMAND_COLUMNS = 'id, machine_id, status, result, error_class, error_detail, created_at, completed_at'

export async function commandStatus(supabase: SupabaseClient, commandId: string): Promise<MachineCommandStatus | null> {
  const { data } = await supabase.from('machine_commands').select(COMMAND_COLUMNS).eq('id', commandId).maybeSingle()
  return (data as MachineCommandStatus | null) ?? null
}

/** The latest TEST_CONNECTION per machine, for the Machine Setup table. */
export async function latestTestConnections(supabase: SupabaseClient, machineIds: readonly string[]): Promise<Map<string, MachineCommandStatus>> {
  const out = new Map<string, MachineCommandStatus>()
  if (!machineIds.length) return out
  const { data } = await supabase
    .from('machine_commands')
    .select(COMMAND_COLUMNS)
    .eq('type', 'TEST_CONNECTION')
    .in('machine_id', machineIds as string[])
    .order('created_at', { ascending: false })
    .limit(200)
  for (const c of (data ?? []) as MachineCommandStatus[]) {
    if (c.machine_id && !out.has(c.machine_id)) out.set(c.machine_id, c)
  }
  return out
}

/** Pure: is the command finished (no more polling)? */
export function isFinished(status: MachineCommandStatus['status']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled' || status === 'expired'
}

/** Pure: the normalized facts a TEST_CONNECTION result reports (Agent DeviceCommandExecutor). */
export function testConnectionSummary(result: Record<string, unknown> | null): {
  reachable: boolean | null
  serialNumber: string | null
  serialCheck: string | null
  elapsedMs: number | null
} {
  const r = result ?? {}
  const identity = (r.identity ?? null) as Record<string, unknown> | null
  return {
    reachable: typeof r.reachable === 'boolean' ? r.reachable : null,
    serialNumber: typeof identity?.serialNumber === 'string' ? identity.serialNumber : null,
    serialCheck: typeof r.serialCheck === 'string' ? r.serialCheck : null,
    elapsedMs: typeof r.elapsedMs === 'number' ? r.elapsedMs : null,
  }
}
